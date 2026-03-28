import { Hono } from "hono";
import { readdir } from "fs/promises";
import { join } from "path";
import { PATHS, getProjectPath, getSettingsPath, getMcpJsonPath } from "../lib/paths";
import { readJsonFile } from "../lib/file-io";
import { scanPlugins } from "../lib/plugin-scanner";
import { scanSkills } from "../lib/skill-scanner";
import { getTokenLevel, getOverallTokenLevel, DEFAULT_CONTEXT_WINDOW, detectContextWindowFromSessions } from "../lib/cost-estimator";
import { getAllSessions } from "../lib/session-scanner";
import type {
  HealthResponse,
  HealthWarning,
  TopPluginByCost,
} from "../../shared/types";
import type { ClaudeJson, ProjectEntry } from "../lib/types";

type SettingsJson = {
  enabledPlugins?: Record<string, boolean>;
  enabledSkills?: Record<string, boolean>;
  hooks?: Record<string, unknown[]>;
  [key: string]: unknown;
};

type ProfileFile = {
  _description: string;
  enabledPlugins: Record<string, boolean>;
  enabledSkills?: Record<string, boolean>;
  hooks?: Record<string, unknown[]>;
  enabledMcpServers?: string[];
  disabledMcpServers?: string[];
};

const getEnabledKeys = (plugins: Record<string, boolean>): Set<string> => {
  const keys = new Set<string>();
  for (const [key, val] of Object.entries(plugins)) {
    if (val) keys.add(key);
  }
  return keys;
};

const isExactMatch = (
  profilePlugins: Record<string, boolean>,
  settingsPlugins: Record<string, boolean>
): boolean => {
  const profileEnabled = getEnabledKeys(profilePlugins);
  const settingsEnabled = getEnabledKeys(settingsPlugins);

  if (profileEnabled.size !== settingsEnabled.size) return false;

  for (const key of profileEnabled) {
    if (!settingsEnabled.has(key)) return false;
  }

  return true;
};

const detectActiveProfile = async (
  settingsPlugins: Record<string, boolean>,
  settingsSkills: Record<string, boolean>,
  settingsHooks: Record<string, unknown[]>,
  enabledMcpNames: Set<string>,
  disabledMcpNames: Set<string>
): Promise<string | null> => {
  try {
    const files = await readdir(PATHS.profilesDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      const filePath = join(PATHS.profilesDir, file);
      const data = await readJsonFile<ProfileFile>(filePath);
      if (!data || !data.enabledPlugins) continue;

      if (!isExactMatch(data.enabledPlugins, settingsPlugins)) continue;

      if (!isExactMatch(data.enabledSkills ?? {}, settingsSkills)) continue;

      const stableStringify = (obj: unknown): string =>
        JSON.stringify(obj, (_, v) =>
          v && typeof v === "object" && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
            : v
        );
      const profileHooksStr = stableStringify(data.hooks ?? {});
      const settingsHooksStr = stableStringify(settingsHooks);
      if (profileHooksStr !== settingsHooksStr) continue;

      // MCP lenient match: skip servers that no longer exist (profiles may
      // reference servers that have since been removed from ~/.claude.json)
      const profileEnabled = data.enabledMcpServers ?? [];
      const profileDisabled = data.disabledMcpServers ?? [];
      const profileTracksMcp = profileEnabled.length > 0 || profileDisabled.length > 0;
      let mcpMatch = true;
      if (profileTracksMcp) {
        for (const name of profileEnabled) {
          if (!enabledMcpNames.has(name) && !disabledMcpNames.has(name)) continue;
          if (!enabledMcpNames.has(name)) { mcpMatch = false; break; }
        }
        if (mcpMatch) {
          for (const name of profileDisabled) {
            if (!enabledMcpNames.has(name) && !disabledMcpNames.has(name)) continue;
            if (!disabledMcpNames.has(name)) { mcpMatch = false; break; }
          }
        }
      }
      if (!mcpMatch) continue;

      return file.replace(/\.json$/, "");
    }
  } catch (err) {
    const isNotFound = err instanceof Error && "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT";
    if (!isNotFound) {
      console.warn("[health] Unexpected error detecting active profile:", err);
    }
  }

  return null;
};

type HookEntry = {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
};

const countHookCommands = (hooks: Record<string, unknown[]>): number => {
  let total = 0;
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const hookEntry = entry as HookEntry;
      if (Array.isArray(hookEntry.hooks)) {
        total += hookEntry.hooks.length;
      }
    }
  }
  return total;
};

type DashboardConfig = {
  contextWindowSize?: number | null;
  [key: string]: unknown;
};

const resolveContextWindow = async (): Promise<number> => {
  const config = await readJsonFile<DashboardConfig>(PATHS.dashboardConfig);
  const override = config?.contextWindowSize;
  if (override != null) return override;

  try {
    const sessions = await getAllSessions();
    const detected = detectContextWindowFromSessions(sessions);
    if (detected != null) return detected;
  } catch {
    // Fall through to default
  }

  return DEFAULT_CONTEXT_WINDOW;
};

const findDuplicatePlugins = (
  enabledPlugins: Record<string, boolean>
): string[] => {
  const nameToEntries = new Map<string, string[]>();

  for (const [id, enabled] of Object.entries(enabledPlugins)) {
    if (!enabled) continue;
    const atIndex = id.indexOf("@");
    const name = atIndex === -1 ? id : id.slice(0, atIndex);
    const existing = nameToEntries.get(name) ?? [];
    existing.push(id);
    nameToEntries.set(name, existing);
  }

  const duplicates: string[] = [];
  for (const [name, entries] of nameToEntries) {
    if (entries.length > 1) {
      duplicates.push(name);
    }
  }

  return duplicates;
};

const health = new Hono();

health.get("/", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const settingsPath = projectPath
      ? getSettingsPath(projectPath)
      : PATHS.globalSettings;

    const [settings, claudeJson, pluginList, contextWindowSize] = await Promise.all([
      readJsonFile<SettingsJson>(settingsPath),
      readJsonFile<ClaudeJson>(PATHS.claudeJson),
      projectPath ? scanPlugins(getSettingsPath(projectPath)) : scanPlugins(),
      resolveContextWindow(),
    ]);

    // Scan skills to compute accurate per-plugin active token counts
    const skillList = await scanSkills(
      projectPath ? getSettingsPath(projectPath) : undefined,
      projectPath
    );

    // Build a map of pluginId -> sum of enabled skill tokens
    const enabledSkillTokensByPlugin = new Map<string, number>();
    for (const skill of skillList) {
      if (!skill.enabled || !skill.pluginId) continue;
      const current = enabledSkillTokensByPlugin.get(skill.pluginId) ?? 0;
      enabledSkillTokensByPlugin.set(skill.pluginId, current + skill.estimatedTokens);
    }

    // Compute activeEstimatedTokens and recalculate tokenLevel for each plugin
    for (const plugin of pluginList) {
      const skillTokens = enabledSkillTokensByPlugin.get(plugin.id) ?? 0;
      plugin.activeEstimatedTokens = plugin.baseEstimatedTokens + skillTokens;
      plugin.tokenLevel = getTokenLevel(plugin.activeEstimatedTokens, contextWindowSize);
    }

    const enabledPlugins = settings?.enabledPlugins ?? {};
    const hooks = settings?.hooks ?? {};

    // MCP servers: global from ~/.claude.json + project .mcp.json if scoped
    const globalMcpServers = claudeJson?.mcpServers ?? {};
    let projectMcpServers: Record<string, unknown> = {};
    if (projectPath) {
      const projectMcpJson = await readJsonFile<ClaudeJson>(
        getMcpJsonPath(projectPath)
      );
      projectMcpServers = projectMcpJson?.mcpServers ?? {};

      // Also check ~/.claude.json projects[path].mcpServers
      const claudeJsonProjects =
        (claudeJson as Record<string, unknown> | null)?.projects as
          | Record<string, { mcpServers?: Record<string, unknown> }>
          | undefined;
      const projectEntry = claudeJsonProjects?.[projectPath];
      if (projectEntry?.mcpServers) {
        projectMcpServers = {
          ...projectMcpServers,
          ...projectEntry.mcpServers,
        };
      }
    }
    const mcpServers = projectPath
      ? { ...globalMcpServers, ...projectMcpServers }
      : globalMcpServers;

    // Plugin counts
    const activePlugins = pluginList.filter((p) => p.enabled).length;
    const totalPlugins = pluginList.length;

    // MCP server count
    const activeMcpServers = Object.keys(mcpServers).length;

    // Hook counts
    const hookEventCount = Object.keys(hooks).length;
    const totalHookCommands = countHookCommands(
      hooks as Record<string, unknown[]>
    );

    // Token estimation (only enabled plugins, using active skill tokens)
    const estimatedTokensPerTurn = pluginList
      .filter((p) => p.enabled)
      .reduce((sum, p) => sum + p.activeEstimatedTokens, 0);

    const tokenBudgetLevel = getOverallTokenLevel(estimatedTokensPerTurn, contextWindowSize);

    // Active profile detection
    const enabledSkills = settings?.enabledSkills ?? {};
    const enabledMcpNames = new Set(Object.keys(claudeJson?.mcpServers ?? {}));
    const disabledMcpNames = new Set(Object.keys(claudeJson?.disabledMcpServers ?? {}));

    // Apply project-scoped MCP overrides
    if (projectPath && claudeJson?.projects) {
      const projEntry = claudeJson.projects[projectPath] as ProjectEntry | undefined;
      if (projEntry?.disabledMcpServers) {
        for (const n of projEntry.disabledMcpServers) {
          enabledMcpNames.delete(n);
          disabledMcpNames.add(n);
        }
      }
    }

    const activeProfile = await detectActiveProfile(
      enabledPlugins,
      enabledSkills as Record<string, boolean>,
      hooks as Record<string, unknown[]>,
      enabledMcpNames,
      disabledMcpNames
    );

    // Build warnings
    const warnings: HealthWarning[] = [];

    if (tokenBudgetLevel === "high") {
      warnings.push({
        level: "warning",
        message: `High token usage: ~${Math.round(estimatedTokensPerTurn / 1000)}k tokens/turn from enabled plugins. Consider disabling unused plugins.`,
        category: "cost",
      });
    }

    const duplicates = findDuplicatePlugins(enabledPlugins);
    for (const name of duplicates) {
      warnings.push({
        level: "warning",
        message: `Duplicate plugin "${name}" enabled from multiple marketplaces.`,
        category: "plugins",
      });
    }

    if (hookEventCount > 5) {
      warnings.push({
        level: "warning",
        message: `${hookEventCount} hook event types active. High hook count may slow down operations.`,
        category: "hooks",
      });
    }

    warnings.push({
      level: "info",
      message: activeProfile
        ? `Active profile: "${activeProfile}" (${activePlugins} plugins)`
        : `No matching profile (${activePlugins} plugins active)`,
      category: "plugins",
    });

    if (activeMcpServers > 0) {
      warnings.push({
        level: "info",
        message: `${activeMcpServers} MCP server${activeMcpServers === 1 ? "" : "s"} configured in ~/.claude.json`,
        category: "mcp",
      });
    }

    // Top plugins by cost (top 10, enabled only, sorted by active cost descending)
    const topPluginsByCost: TopPluginByCost[] = pluginList
      .filter((p) => p.enabled)
      .sort((a, b) => b.activeEstimatedTokens - a.activeEstimatedTokens)
      .slice(0, 10)
      .map((p) => ({
        name: p.name,
        estimatedTokens: p.activeEstimatedTokens,
        tokenLevel: p.tokenLevel,
      }));

    const response: HealthResponse = {
      scope: projectPath ?? null,
      summary: {
        activePlugins,
        totalPlugins,
        activeMcpServers,
        hookEventCount,
        totalHookCommands,
        estimatedTokensPerTurn,
        tokenBudgetLevel,
        activeProfile,
        contextWindowSize,
      },
      warnings,
      topPluginsByCost,
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { health };
