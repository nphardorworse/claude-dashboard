import { readdir, readFile, stat, realpath } from "fs/promises";
import { join, basename, extname } from "path";
import { PATHS } from "./paths";
import { readJsonFile } from "./file-io";
import { estimateTokens, getTokenLevel } from "./cost-estimator";
import type { SkillInfo, SkillSource, EnableSource } from "../../shared/types";

type SettingsJson = {
  enabledSkills?: Record<string, boolean>;
  enabledPlugins?: Record<string, boolean>;
};

type InstalledPluginEntry = {
  scope: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
};

type InstalledPluginsFile = {
  version: number;
  plugins: Record<string, InstalledPluginEntry[]>;
};

type ParsedFrontmatter = {
  name?: string;
  description?: string;
};

const parseFrontmatter = (content: string): ParsedFrontmatter => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: ParsedFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key === "name") result.name = value;
    if (key === "description") result.description = value;
  }
  return result;
};

const dirEntries = async (dirPath: string): Promise<string[]> => {
  try {
    const entries = await readdir(dirPath);
    return entries.filter((e) => !e.startsWith("."));
  } catch {
    return [];
  }
};

const fileSize = async (filePath: string): Promise<number> => {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return 0;
  }
};

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt",
  ".yaml", ".yml", ".toml", ".css", ".html", ".sh",
  ".py", ".rb", ".rs", ".go", ".lua", ".sql", ".xml",
  ".csv", ".env", ".cfg", ".ini", ".conf",
]);

/** Walk a directory and sum the byte sizes of all text files */
const walkDirBytes = async (dirPath: string): Promise<number> => {
  let total = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await walkDirBytes(fullPath);
      } else if (entry.isFile()) {
        if (TEXT_EXTENSIONS.has(extname(entry.name))) {
          const s = await stat(fullPath);
          total += s.size;
        }
      }
    }
  } catch {
    // Directory may not exist
  }
  return total;
};

const resolveEnabled = (
  id: string,
  globalMap: Record<string, boolean>,
  projectMap: Record<string, boolean> | null
): { enabled: boolean; source: EnableSource } => {
  if (projectMap && id in projectMap) {
    return { enabled: projectMap[id], source: "project" };
  }
  if (id in globalMap) {
    return { enabled: globalMap[id], source: "global" };
  }
  return { enabled: true, source: "default" };
};

type DiscoveredSkill = {
  id: string;
  skillMdPath: string;
  source: SkillSource;
  pluginId?: string;
  pluginName?: string;
  resolvedPath: string;
};

const discoverUserSkills = async (): Promise<DiscoveredSkill[]> => {
  const results: DiscoveredSkill[] = [];

  for (const dir of [PATHS.skillsDir, PATHS.agentSkillsDir]) {
    const entries = await dirEntries(dir);
    for (const entry of entries) {
      const skillMdPath = join(dir, entry, "SKILL.md");
      const size = await fileSize(skillMdPath);
      if (size === 0) continue;

      let resolvedPath: string;
      try {
        resolvedPath = await realpath(skillMdPath);
      } catch {
        continue;
      }

      results.push({
        id: entry,
        skillMdPath,
        source: "user",
        resolvedPath,
      });
    }
  }

  return results;
};

const discoverPluginSkills = async (): Promise<DiscoveredSkill[]> => {
  const file = await readJsonFile<InstalledPluginsFile>(PATHS.installedPlugins);
  if (!file?.plugins) return [];

  const results: DiscoveredSkill[] = [];

  for (const [pluginId, entries] of Object.entries(file.plugins)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const installPath = entries[0].installPath;

    const skillDirs = [
      join(installPath, "skills"),
      join(installPath, ".claude", "skills"),
    ];

    const atIndex = pluginId.indexOf("@");
    const pluginName = atIndex === -1 ? pluginId : pluginId.slice(0, atIndex);

    for (const skillDir of skillDirs) {
      const skillEntries = await dirEntries(skillDir);
      for (const entry of skillEntries) {
        const skillMdPath = join(skillDir, entry, "SKILL.md");
        const size = await fileSize(skillMdPath);
        if (size === 0) continue;

        let resolvedPath: string;
        try {
          resolvedPath = await realpath(skillMdPath);
        } catch {
          continue;
        }

        results.push({
          id: `${pluginName}:${entry}`,
          skillMdPath,
          source: "plugin",
          pluginId,
          pluginName,
          resolvedPath,
        });
      }
    }
  }

  return results;
};

const discoverProjectSkills = async (
  projectPath: string
): Promise<DiscoveredSkill[]> => {
  const skillDir = join(projectPath, ".claude", "skills");
  const entries = await dirEntries(skillDir);
  const results: DiscoveredSkill[] = [];

  for (const entry of entries) {
    const skillMdPath = join(skillDir, entry, "SKILL.md");
    const size = await fileSize(skillMdPath);
    if (size === 0) continue;

    let resolvedPath: string;
    try {
      resolvedPath = await realpath(skillMdPath);
    } catch {
      continue;
    }

    results.push({
      id: `project:${entry}`,
      skillMdPath,
      source: "project",
      resolvedPath,
    });
  }

  return results;
};

export const scanSkills = async (
  projectSettingsPath?: string,
  projectPath?: string
): Promise<SkillInfo[]> => {
  const [userSkills, pluginSkills, projectSkills] = await Promise.all([
    discoverUserSkills(),
    discoverPluginSkills(),
    projectPath ? discoverProjectSkills(projectPath) : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const allDiscovered: DiscoveredSkill[] = [];

  for (const skill of [...userSkills, ...projectSkills, ...pluginSkills]) {
    if (seen.has(skill.resolvedPath)) continue;
    seen.add(skill.resolvedPath);
    allDiscovered.push(skill);
  }

  const globalSettings = await readJsonFile<SettingsJson>(PATHS.globalSettings);
  const globalSkillMap = globalSettings?.enabledSkills ?? {};
  const globalPluginMap = globalSettings?.enabledPlugins ?? {};

  let projectSkillMap: Record<string, boolean> | null = null;
  let projectPluginMap: Record<string, boolean> | null = null;
  if (projectSettingsPath) {
    const projectSettings = await readJsonFile<SettingsJson>(projectSettingsPath);
    projectSkillMap = projectSettings?.enabledSkills ?? null;
    projectPluginMap = projectSettings?.enabledPlugins ?? null;
  }

  const results: SkillInfo[] = [];

  for (const discovered of allDiscovered) {
    try {
      const content = await readFile(discovered.skillMdPath, "utf-8");
      const frontmatter = parseFrontmatter(content);

      // Walk the entire skill directory for accurate cost, not just SKILL.md
      const skillDir = join(discovered.skillMdPath, "..");
      const contentSizeBytes = await walkDirBytes(skillDir);
      const estimatedTokensVal = estimateTokens(contentSizeBytes);
      const tokenLevel = getTokenLevel(estimatedTokensVal);

      const { enabled, source: enableSource } = resolveEnabled(
        discovered.id,
        globalSkillMap,
        projectSkillMap
      );

      let parentPluginEnabled = true;
      if (discovered.source === "plugin" && discovered.pluginId) {
        const pluginEnabled = resolveEnabled(
          discovered.pluginId,
          globalPluginMap,
          projectPluginMap
        );
        parentPluginEnabled = pluginEnabled.enabled;
      }

      results.push({
        id: discovered.id,
        name: frontmatter.name ?? basename(join(discovered.skillMdPath, "..")),
        description: frontmatter.description ?? "",
        source: discovered.source,
        pluginId: discovered.pluginId,
        pluginName: discovered.pluginName,
        enabled: parentPluginEnabled ? enabled : false,
        enableSource,
        parentPluginEnabled,
        installPath: discovered.skillMdPath,
        contentSizeBytes,
        estimatedTokens: estimatedTokensVal,
        tokenLevel,
      });
    } catch {
      // Skip skills we can't read
    }
  }

  return results;
};
