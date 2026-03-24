import { homedir } from "os";
import { join, resolve } from "path";
import type { Context } from "hono";
import { readFileSync } from "fs";

const CLAUDE_DIR = join(homedir(), ".claude");

// Allowlist of known project paths from ~/.claude.json
let knownProjectsCache: Set<string> | null = null;
let knownProjectsCacheTime = 0;
const KNOWN_PROJECTS_TTL_MS = 30_000;

const loadKnownProjects = (): Set<string> => {
  const now = Date.now();
  if (knownProjectsCache && now - knownProjectsCacheTime < KNOWN_PROJECTS_TTL_MS) {
    return knownProjectsCache;
  }
  try {
    const raw = readFileSync(join(homedir(), ".claude.json"), "utf-8");
    const data = JSON.parse(raw);
    const projects = data.projects ?? {};
    knownProjectsCache = new Set(Object.keys(projects));
    knownProjectsCacheTime = now;
    return knownProjectsCache;
  } catch {
    return new Set();
  }
};

const validateProjectPath = (decoded: string): string | undefined => {
  // Must be absolute
  if (!decoded.startsWith("/")) return undefined;
  // Resolve to catch .. traversal
  const resolved = resolve(decoded);
  // Must be in the known projects allowlist
  const known = loadKnownProjects();
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

export const getProjectPath = (c: Context): string | undefined => {
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
