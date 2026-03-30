import { basename, join } from "path";
import { PATHS, loadKnownProjects } from "./paths";
import { readJsonFile } from "./file-io";
import { checkMcpHealth } from "./mcp-health";
import { scanPluginMcps } from "./plugin-mcp-scanner";
import type { ClaudeJson } from "./types";
import type {
  McpOrigin,
  McpCatalogEntry,
  McpCatalogGroup,
  McpServerConfig,
  CatalogResponse,
  ProjectMcpStatus,
} from "../../shared/types";

type DashboardConfig = {
  pinnedMcpServers?: string[];
  [key: string]: unknown;
};

type McpJsonFile = Record<string, unknown>;

// --- Helpers ---

const parseMcpJson = (raw: McpJsonFile): Record<string, McpServerConfig> => {
  if (raw.mcpServers && typeof raw.mcpServers === "object") {
    return raw.mcpServers as Record<string, McpServerConfig>;
  }
  const result: Record<string, McpServerConfig> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = value as McpServerConfig;
    }
  }
  return result;
};

const makeEntry = (
  name: string,
  origin: McpOrigin,
  config: McpServerConfig,
  healthMap: Map<string, McpCatalogEntry["health"]>,
  pinnedSet: Set<string>,
  extra?: Partial<McpCatalogEntry>,
): McpCatalogEntry => ({
  name,
  origin,
  config,
  health: healthMap.get(name) ?? "unknown",
  isPinned: pinnedSet.has(name),
  ...extra,
});

const makeGroup = (
  label: string,
  origin: McpOrigin,
  entries: McpCatalogEntry[],
  pluginName?: string,
): McpCatalogGroup => ({
  label,
  origin,
  entries,
  ...(pluginName ? { pluginName } : {}),
});

const filterGroups = (
  groups: McpCatalogGroup[],
  status: ProjectMcpStatus,
): McpCatalogGroup[] =>
  groups
    .map((g) => ({
      ...g,
      entries: g.entries.filter((e) => e.projectStatus === status),
    }))
    .filter((g) => g.entries.length > 0);

const scanProjectMcps = async (
  knownProjects: Set<string>,
  healthMap: Map<string, McpCatalogEntry["health"]>,
  pinnedSet: Set<string>,
): Promise<McpCatalogGroup[]> => {
  const groupsByProject = new Map<string, McpCatalogEntry[]>();

  for (const projectPath of knownProjects) {
    const candidates = [
      join(projectPath, ".mcp.json"),
      join(projectPath, ".claude", ".mcp.json"),
    ];

    for (const candidate of candidates) {
      const raw = await readJsonFile<McpJsonFile>(candidate);
      if (!raw) continue;

      const servers = parseMcpJson(raw);
      const _projectName = basename(projectPath);

      for (const [name, config] of Object.entries(servers)) {
        const entry = makeEntry(name, "project", config, healthMap, pinnedSet, {
          sourceProject: projectPath,
        });
        const existing = groupsByProject.get(projectPath) ?? [];
        existing.push(entry);
        groupsByProject.set(projectPath, existing);
      }
      break; // first found file wins per project
    }
  }

  return Array.from(groupsByProject.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, entries]) => {
      const name = basename(path);
      return makeGroup(`Project: ${name}`, "project", entries);
    });
};

// --- Main ---

export const buildCatalog = async (
  projectPath?: string,
): Promise<CatalogResponse> => {
  const [claudeJson, dashConfig, healthList, pluginMcps, knownProjects] =
    await Promise.all([
      readJsonFile<ClaudeJson>(PATHS.claudeJson),
      readJsonFile<DashboardConfig>(PATHS.dashboardConfig),
      checkMcpHealth(),
      scanPluginMcps(),
      loadKnownProjects(),
    ]);

  // Health lookup
  const healthMap = new Map<string, McpCatalogEntry["health"]>();
  for (const h of healthList) {
    healthMap.set(h.name, h.status);
  }

  // Pinned lookup
  const pinnedSet = new Set(dashConfig?.pinnedMcpServers ?? []);

  // Track all known names for cloud detection
  const knownNames = new Set<string>();

  // 1. Global MCPs
  const globalEntries: McpCatalogEntry[] = [];
  for (const [name, config] of Object.entries(claudeJson?.mcpServers ?? {})) {
    globalEntries.push(makeEntry(name, "global", config, healthMap, pinnedSet));
    knownNames.add(name);
  }

  // 2. Global disabled MCPs
  const globalDisabledEntries: McpCatalogEntry[] = [];
  for (const [name, config] of Object.entries(claudeJson?.disabledMcpServers ?? {})) {
    globalDisabledEntries.push(
      makeEntry(name, "global-disabled", config, healthMap, pinnedSet),
    );
    knownNames.add(name);
  }

  // 3. Plugin MCPs (dedup same name + same command/url)
  const pluginGroupMap = new Map<string, McpCatalogEntry[]>();
  const pluginDedupMap = new Map<string, McpCatalogEntry>(); // key: mcpName

  for (const pm of pluginMcps) {
    knownNames.add(pm.mcpName);
    const existing = pluginDedupMap.get(pm.mcpName);

    if (existing && existing.config.command === pm.config.command && existing.config.url === pm.config.url) {
      // Same name + same target: merge plugin names
      const names = existing.pluginNames ?? (existing.pluginName ? [existing.pluginName] : []);
      if (!names.includes(pm.pluginName)) names.push(pm.pluginName);
      existing.pluginNames = names;
      // Register existing entry in the second plugin's group too
      const secondGroup = pluginGroupMap.get(pm.pluginName) ?? [];
      if (!secondGroup.includes(existing)) secondGroup.push(existing);
      pluginGroupMap.set(pm.pluginName, secondGroup);
      continue;
    }

    // Different URL from existing entry with same name — disambiguate
    if (existing) {
      // Only add suffix if not already disambiguated (prevents double-suffix on 3+ collisions)
      if (existing.name === pm.mcpName) {
        existing.name = `${pm.mcpName} (${existing.pluginName})`;
      }
      // Remove from dedup map so subsequent same-named entries don't match stale record
      pluginDedupMap.delete(pm.mcpName);
    }
    const entry = makeEntry(
      existing ? `${pm.mcpName} (${pm.pluginName})` : pm.mcpName,
      "plugin",
      pm.config,
      healthMap,
      pinnedSet,
      { pluginName: pm.pluginName },
    );
    if (!existing) pluginDedupMap.set(pm.mcpName, entry);

    const group = pluginGroupMap.get(pm.pluginName) ?? [];
    group.push(entry);
    pluginGroupMap.set(pm.pluginName, group);
  }

  const pluginGroups = Array.from(pluginGroupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entries]) => makeGroup(`Plugin: ${name}`, "plugin", entries, name));

  // 4. Project MCPs (from .mcp.json files)
  const projectGroups = await scanProjectMcps(knownProjects, healthMap, pinnedSet);
  for (const g of projectGroups) {
    for (const e of g.entries) knownNames.add(e.name);
  }

  // 5. Personal MCPs (per-project from claude.json)
  const personalGroupsByProject = new Map<string, McpCatalogEntry[]>();
  const allProjectPaths = projectPath
    ? [projectPath]
    : Object.keys(claudeJson?.projects ?? {});

  for (const pp of allProjectPaths) {
    const projEntry = claudeJson?.projects?.[pp];
    if (!projEntry?.mcpServers) continue;
    const entries: McpCatalogEntry[] = [];
    for (const [name, config] of Object.entries(projEntry.mcpServers)) {
      entries.push(
        makeEntry(name, "personal", config, healthMap, pinnedSet, {
          sourceProject: pp,
        }),
      );
      knownNames.add(name);
    }
    if (entries.length > 0) personalGroupsByProject.set(pp, entries);
  }

  // 6. Cloud MCPs (health entries not matching any known name)
  const cloudEntries: McpCatalogEntry[] = [];
  for (const h of healthList) {
    if (!knownNames.has(h.name)) {
      cloudEntries.push(
        makeEntry(h.name, "cloud", { url: h.command }, healthMap, pinnedSet),
      );
    }
  }

  // Assemble groups in order
  const groups: McpCatalogGroup[] = [];
  if (globalEntries.length > 0) {
    groups.push(makeGroup("Global", "global", globalEntries));
  }
  if (globalDisabledEntries.length > 0) {
    groups.push(makeGroup("Global (Disabled)", "global-disabled", globalDisabledEntries));
  }
  groups.push(...pluginGroups);
  groups.push(...projectGroups);
  for (const [pp, entries] of personalGroupsByProject) {
    const projName = basename(pp);
    const label = projectPath ? "Personal" : `Personal: ${projName}`;
    groups.push(makeGroup(label, "personal", entries));
  }
  if (cloudEntries.length > 0) {
    groups.push(makeGroup("Cloud", "cloud", cloudEntries));
  }

  // Counts
  const allEntries = groups.flatMap((g) => g.entries);
  const totalCount = allEntries.length;
  const connectedCount = allEntries.filter((e) => e.health === "connected").length;

  // Global view
  if (!projectPath) {
    return { scope: "global", groups, totalCount, connectedCount };
  }

  // Project view: compute projectStatus for every entry
  const projEntry = claudeJson?.projects?.[projectPath];
  const disabledGlobal = new Set(projEntry?.disabledMcpServers ?? []);
  const disabledPlugin = new Set(projEntry?.disabledMcpjsonServers ?? []);
  const enabledPlugin = new Set(projEntry?.enabledMcpjsonServers ?? []);

  const resolveStatus = (entry: McpCatalogEntry): ProjectMcpStatus => {
    switch (entry.origin) {
      case "personal":
        return "active";
      case "global":
        return disabledGlobal.has(entry.name) ? "disabled" : "active";
      case "plugin":
        if (disabledPlugin.has(entry.name)) return "disabled";
        if (enabledPlugin.has(entry.name)) return "active";
        return "active"; // Claude Code default: plugins on
      case "cloud":
        return disabledGlobal.has(entry.name) ? "disabled" : "active";
      case "global-disabled":
        return "available";
      case "project":
        return entry.sourceProject === projectPath ? "active" : "available";
      default:
        return "available";
    }
  };

  // Stamp projectStatus on all entries
  for (const group of groups) {
    for (const entry of group.entries) {
      entry.projectStatus = resolveStatus(entry);
    }
  }

  return {
    scope: "project",
    groups,
    active: filterGroups(groups, "active"),
    disabled: filterGroups(groups, "disabled"),
    available: filterGroups(groups, "available"),
    totalCount,
    connectedCount,
  };
};
