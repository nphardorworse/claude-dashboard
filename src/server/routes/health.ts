import { Hono } from "hono";
import { readdir } from "fs/promises";
import { join } from "path";
import { PATHS, getProjectPath, getSettingsPath, getMcpJsonPath } from "../lib/paths";
import { readJsonFile } from "../lib/file-io";
import { scanPlugins } from "../lib/plugin-scanner";
import { getTokenLevel } from "../lib/cost-estimator";
import type {
  HealthResponse,
  HealthWarning,
  TopPluginByCost,
  TokenLevel,
} from "../../shared/types";

type SettingsJson = {
  enabledPlugins?: Record<string, boolean>;
  hooks?: Record<string, unknown[]>;
  [key: string]: unknown;
};

type ClaudeJson = {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
};

type ProfileFile = {
  _description: string;
  enabledPlugins: Record<string, boolean>;
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
  settingsPlugins: Record<string, boolean>
): Promise<string | null> => {
  try {
    const files = await readdir(PATHS.profilesDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      const filePath = join(PATHS.profilesDir, file);
      const data = await readJsonFile<ProfileFile>(filePath);
      if (!data || !data.enabledPlugins) continue;

      if (isExactMatch(data.enabledPlugins, settingsPlugins)) {
        return file.replace(/\.json$/, "");
      }
    }
  } catch {
    // Profiles dir may not exist
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

const getOverallTokenLevel = (tokens: number): TokenLevel => {
  if (tokens < 50_000) return "low";
  if (tokens <= 150_000) return "medium";
  return "high";
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

    const [settings, claudeJson, pluginList] = await Promise.all([
      readJsonFile<SettingsJson>(settingsPath),
      readJsonFile<ClaudeJson>(PATHS.claudeJson),
      projectPath ? scanPlugins(getSettingsPath(projectPath)) : scanPlugins(),
    ]);

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

    // Token estimation (only enabled plugins)
    const estimatedTokensPerTurn = pluginList
      .filter((p) => p.enabled)
      .reduce((sum, p) => sum + p.estimatedTokens, 0);

    const tokenBudgetLevel = getOverallTokenLevel(estimatedTokensPerTurn);

    // Active profile detection
    const activeProfile = await detectActiveProfile(enabledPlugins);

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

    // Top plugins by cost (top 10, enabled only, sorted descending)
    const topPluginsByCost: TopPluginByCost[] = pluginList
      .filter((p) => p.enabled)
      .sort((a, b) => b.estimatedTokens - a.estimatedTokens)
      .slice(0, 10)
      .map((p) => ({
        name: p.name,
        estimatedTokens: p.estimatedTokens,
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
