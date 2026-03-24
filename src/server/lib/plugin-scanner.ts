import { readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { PATHS } from "./paths";
import { readJsonFile } from "./file-io";
import { estimateTokens, getTokenLevel } from "./cost-estimator";
import type { PluginInfo, PluginEnableSource } from "../../shared/types";

type InstalledPluginEntry = {
  scope: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha?: string;
};

type InstalledPluginsFile = {
  version: number;
  plugins: Record<string, InstalledPluginEntry[]>;
};

type InstalledPlugin = {
  id: string;
  installPath: string;
  version: string;
  lastUpdated: string;
};

type PluginManifest = {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  lastUpdated?: string;
};

type SettingsJson = {
  enabledPlugins?: Record<string, boolean>;
};

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt",
  ".yaml", ".yml", ".toml", ".css", ".html", ".sh",
  ".py", ".rb", ".rs", ".go", ".lua", ".sql", ".xml",
  ".csv", ".env", ".cfg", ".ini", ".conf",
]);

const walkTextFiles = async (dirPath: string): Promise<number> => {
  let totalBytes = 0;

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      if (entry.isDirectory()) {
        totalBytes += await walkTextFiles(fullPath);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) {
        try {
          const fileStat = await stat(fullPath);
          totalBytes += fileStat.size;
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Directory not readable
  }

  return totalBytes;
};

const dirExists = async (dirPath: string): Promise<boolean> => {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
};

const parsePluginId = (id: string): { name: string; marketplace: string } => {
  const atIndex = id.indexOf("@");
  if (atIndex === -1) {
    return { name: id, marketplace: "unknown" };
  }
  return {
    name: id.slice(0, atIndex),
    marketplace: id.slice(atIndex + 1),
  };
};

type ResolvedEnabled = {
  enabled: boolean;
  source: PluginEnableSource;
};

const resolveEnabled = (
  id: string,
  globalMap: Record<string, boolean>,
  projectMap: Record<string, boolean> | null
): ResolvedEnabled => {
  // Project overrides take highest precedence
  if (projectMap && id in projectMap) {
    return { enabled: projectMap[id], source: "project" };
  }
  // Then global
  if (id in globalMap) {
    return { enabled: globalMap[id], source: "global" };
  }
  // Default: enabled (Claude Code's behavior for unmentioned plugins)
  return { enabled: true, source: "default" };
};

const scanSinglePlugin = async (
  installed: InstalledPlugin,
  globalMap: Record<string, boolean>,
  projectMap: Record<string, boolean> | null
): Promise<PluginInfo | null> => {
  const { name, marketplace } = parsePluginId(installed.id);

  const manifestPath = join(
    installed.installPath,
    ".claude-plugin",
    "plugin.json"
  );
  const manifest = await readJsonFile<PluginManifest>(manifestPath);

  const [hasAgents, hasSkills, hasMcp] = await Promise.all([
    dirExists(join(installed.installPath, "agents")),
    dirExists(join(installed.installPath, "skills")),
    fileExists(join(installed.installPath, ".mcp.json")),
  ]);

  const contentSizeBytes = await walkTextFiles(installed.installPath);
  const estimatedTokens = estimateTokens(contentSizeBytes);
  const tokenLevel = getTokenLevel(estimatedTokens);

  const { enabled, source } = resolveEnabled(installed.id, globalMap, projectMap);

  return {
    id: installed.id,
    name: manifest?.name ?? name,
    marketplace,
    description: manifest?.description ?? "",
    enabled,
    enableSource: source,
    version: installed.version ?? manifest?.version ?? "0.0.0",
    installPath: installed.installPath,
    lastUpdated: installed.lastUpdated ?? manifest?.lastUpdated ?? "",
    contentSizeBytes,
    estimatedTokens,
    tokenLevel,
    hasAgents,
    hasSkills,
    hasMcp,
  };
};

const parseInstalledPlugins = (file: InstalledPluginsFile): InstalledPlugin[] => {
  const result: InstalledPlugin[] = [];
  for (const [id, entries] of Object.entries(file.plugins)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    // Take the first (most recent) entry
    const entry = entries[0];
    result.push({
      id,
      installPath: entry.installPath,
      version: entry.version,
      lastUpdated: entry.lastUpdated,
    });
  }
  return result;
};

export const scanPlugins = async (projectSettingsPath?: string): Promise<PluginInfo[]> => {
  const file = await readJsonFile<InstalledPluginsFile>(PATHS.installedPlugins);
  if (!file || !file.plugins) {
    return [];
  }

  const installed = parseInstalledPlugins(file);

  // Always read global as baseline
  const globalSettings = await readJsonFile<SettingsJson>(PATHS.globalSettings);
  const globalMap = globalSettings?.enabledPlugins ?? {};

  // Read project overrides if a project path is given
  let projectMap: Record<string, boolean> | null = null;
  if (projectSettingsPath) {
    const projectSettings = await readJsonFile<SettingsJson>(projectSettingsPath);
    if (projectSettings?.enabledPlugins) {
      projectMap = projectSettings.enabledPlugins;
    }
  }

  const results = await Promise.all(
    installed.map((p) => scanSinglePlugin(p, globalMap, projectMap))
  );

  return results.filter((p): p is PluginInfo => p !== null);
};
