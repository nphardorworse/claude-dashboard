import { join, resolve, sep } from "path";
import { PATHS } from "./paths";
import { readJsonFile } from "./file-io";
import type { McpServerConfig } from "../../shared/types";

export type PluginMcp = {
  mcpName: string;
  pluginId: string;
  pluginName: string;
  config: McpServerConfig;
};

type InstalledPlugins = {
  plugins: Record<string, Array<{ installPath: string }>>;
};

type McpJsonFile = Record<string, unknown>;

let pluginMcpCache: PluginMcp[] | null = null;
let pluginMcpCacheTime = 0;
const PLUGIN_MCP_TTL_MS = 30_000;

const parsePluginName = (pluginId: string): string => {
  // "context7@claude-plugins-official" → "context7"
  const atIndex = pluginId.indexOf("@");
  return atIndex > 0 ? pluginId.slice(0, atIndex) : pluginId;
};

const parseMcpJson = (raw: McpJsonFile): Record<string, McpServerConfig> => {
  // Standard format: { "mcpServers": { "name": { config } } }
  if (raw.mcpServers && typeof raw.mcpServers === "object") {
    return raw.mcpServers as Record<string, McpServerConfig>;
  }
  // Fallback: all top-level keys are server names (e.g., context7 plugin uses this format)
  const result: Record<string, McpServerConfig> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = value as McpServerConfig;
    }
  }
  return result;
};

export const scanPluginMcps = async (): Promise<PluginMcp[]> => {
  const now = Date.now();
  if (pluginMcpCache && now - pluginMcpCacheTime < PLUGIN_MCP_TTL_MS) {
    return pluginMcpCache;
  }

  const installed = await readJsonFile<InstalledPlugins>(PATHS.installedPlugins);
  if (!installed) {
    // Transient read failure — preserve existing cache
    return pluginMcpCache ?? [];
  }
  if (!installed.plugins) {
    pluginMcpCache = [];
    pluginMcpCacheTime = now;
    return [];
  }

  const results: PluginMcp[] = [];

  for (const [pluginId, entries] of Object.entries(installed.plugins)) {
    if (!entries || entries.length === 0) continue;
    const rawPath = entries[0].installPath;
    if (!rawPath) continue;

    // Defense-in-depth: ensure installPath resolves under the plugin cache
    const installPath = resolve(rawPath);
    if (!installPath.startsWith(PATHS.pluginCache + sep) && !installPath.startsWith(PATHS.claudeDir + sep)) continue;

    const mcpJsonPath = join(installPath, ".mcp.json");
    const raw = await readJsonFile<McpJsonFile>(mcpJsonPath);
    if (!raw) continue;

    const servers = parseMcpJson(raw);
    const pluginName = parsePluginName(pluginId);

    for (const [mcpName, config] of Object.entries(servers)) {
      results.push({ mcpName, pluginId, pluginName, config });
    }
  }

  pluginMcpCache = results;
  pluginMcpCacheTime = now;
  return results;
};
