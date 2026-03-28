import { homedir } from "os";
import { join, resolve } from "path";
import type { Context } from "hono";
import { readFile, readdir } from "fs/promises";

const CLAUDE_DIR = join(homedir(), ".claude");

// Allowlist of known project paths from all Claude sources
let knownProjectsCache: Set<string> | null = null;
let knownProjectsCacheTime = 0;
const KNOWN_PROJECTS_TTL_MS = 30_000;

export const loadKnownProjects = async (): Promise<Set<string>> => {
  const now = Date.now();
  if (knownProjectsCache && now - knownProjectsCacheTime < KNOWN_PROJECTS_TTL_MS) {
    return knownProjectsCache;
  }

  const projects = new Set<string>();

  // Source 1: ~/.claude.json projects map
  try {
    const raw = await readFile(join(homedir(), ".claude.json"), "utf-8");
    const data = JSON.parse(raw);
    for (const path of Object.keys(data.projects ?? {})) {
      projects.add(path);
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // Expected: file/dir doesn't exist
    } else {
      console.warn("[paths] Unexpected error loading known projects:", err);
    }
  }

  // Source 2: session-meta files (sample recent ones)
  try {
    const metaDir = join(CLAUDE_DIR, "usage-data", "session-meta");
    const files = await readdir(metaDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).slice(-200);
    await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const raw = await readFile(join(metaDir, file), "utf-8");
          const data = JSON.parse(raw);
          if (data.project_path) projects.add(data.project_path);
        } catch { /* skip */ }
      })
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // Expected: file/dir doesn't exist
    } else {
      console.warn("[paths] Unexpected error loading known projects:", err);
    }
  }

  // Source 3: ~/.claude/projects/ dirs (read cwd from first JSONL)
  try {
    const projectsDir = join(CLAUDE_DIR, "projects");
    const entries = await readdir(projectsDir);
    for (const entry of entries) {
      if (entry === ".DS_Store" || entry === "-") continue;
      try {
        const dirPath = join(projectsDir, entry);
        const dirFiles = await readdir(dirPath);
        const firstJsonl = dirFiles.find((f) => f.endsWith(".jsonl"));
        if (!firstJsonl) continue;
        const raw = await readFile(join(dirPath, firstJsonl), "utf-8");
        const lines = raw.slice(0, 2000).split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.cwd) { projects.add(parsed.cwd); break; }
          } catch { continue; }
        }
      } catch { continue; }
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // Expected: file/dir doesn't exist
    } else {
      console.warn("[paths] Unexpected error loading known projects:", err);
    }
  }

  knownProjectsCache = projects;
  knownProjectsCacheTime = now;
  return projects;
};

export const validateProjectPath = async (decoded: string): Promise<string | undefined> => {
  // Must be absolute
  if (!decoded.startsWith("/")) return undefined;
  // Resolve to catch .. traversal
  const resolved = resolve(decoded);
  // Must be in the known projects allowlist
  const known = await loadKnownProjects();
  if (!known.has(resolved)) return undefined;
  return resolved;
};

export const PATHS = {
  claudeDir: CLAUDE_DIR,
  globalSettings: join(CLAUDE_DIR, "settings.json"),
  globalLocalSettings: join(CLAUDE_DIR, "settings.local.json"),
  claudeJson: join(homedir(), ".claude.json"),
  installedPlugins: join(CLAUDE_DIR, "plugins", "installed_plugins.json"),
  pluginCache: join(CLAUDE_DIR, "plugins", "cache"),
  profilesDir: join(CLAUDE_DIR, "profiles"),
  backupsDir: join(CLAUDE_DIR, "backups"),
  sessionMeta: join(CLAUDE_DIR, "usage-data", "session-meta"),
  dashboardConfig: join(CLAUDE_DIR, "dashboard-config.json"),
  skillsDir: join(CLAUDE_DIR, "skills"),
  agentSkillsDir: join(homedir(), ".agents", "skills"),
};

export const getProjectPath = async (c: Context): Promise<string | undefined> => {
  const encoded = c.req.query("project");
  if (!encoded) return undefined;
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  return validateProjectPath(decoded);
};

export const getSettingsPath = (projectPath?: string): string => {
  if (!projectPath) return PATHS.globalSettings;
  return join(projectPath, ".claude", "settings.json");
};

export const getMcpJsonPath = (projectPath?: string): string => {
  if (!projectPath) return PATHS.claudeJson;
  return join(projectPath, ".mcp.json");
};

export const getProjectSessionsDir = (projectPath: string): string => {
  const key = projectPath.split("/").join("-");
  return join(PATHS.claudeDir, "projects", key);
};
