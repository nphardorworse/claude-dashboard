import { homedir } from "os";
import { join, resolve, isAbsolute } from "path";
import type { Context } from "hono";
import { readFile, readdir, stat } from "fs/promises";
import { readJsonlLines } from "./jsonl-stream";

const CLAUDE_DIR = join(homedir(), ".claude");

// Allowlist of known project paths from all Claude sources
let knownProjectsCache: Set<string> | null = null;
let knownProjectsCacheTime = 0;
const KNOWN_PROJECTS_TTL_MS = 30_000;

// Reverse map: resolved project path → its session dirs on disk, the dir
// named after the path first. One project can own several dirs (a worktree
// launched from the repo root, a renamed path). Populated by Source 3.
const projectDirMap = new Map<string, string[]>();

// Session file index: sessionId → absolute file path
// Populated lazily by scanning ~/.claude/projects/
let sessionFileIndex: Map<string, string> | null = null;
let sessionFileIndexTime = 0;
const SESSION_INDEX_TTL_MS = 30_000;

// Coalesces concurrent refreshes. Nearly every request goes through
// validateProjectPath, so without this a burst of requests each ran its own
// sweep over all ~/.claude/projects dirs at the same time.
let knownProjectsInFlight: Promise<Set<string>> | null = null;

/**
 * The session dir name Claude Code uses for a project path: every character
 * that is not an ASCII letter or digit becomes "-" (so "/Users/a/.x y" and
 * "C:\\a\\b" map to "-Users-a--x-y" and "C--a-b").
 */
export const toSessionDirName = (projectPath: string): string =>
  projectPath.replace(/[^a-zA-Z0-9]/g, "-");

// Lines searched for a `cwd` before giving up on a file. In real transcripts
// the first cwd sits on line 3 to 10, after title and queue entries.
const FIRST_CWD_MAX_LINES = 100;

// First absolute cwd found in each transcript, keyed by file path. Transcripts
// are append-only, so a found cwd never changes; a miss is retried once the
// file has grown.
const firstCwdCache = new Map<string, { cwd: string | null; size: number }>();

/**
 * The first absolute `cwd` in a transcript, streamed line by line. Never a
 * fixed-size head: the line holding the first cwd is often a SessionStart
 * hook entry several KB long, so a 2000-char head missed it for most dirs.
 */
const readFirstCwd = async (filePath: string): Promise<string | null> => {
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return null;
  }
  const cached = firstCwdCache.get(filePath);
  if (cached && (cached.cwd !== null || cached.size === size)) return cached.cwd;

  let cwd: string | null = null;
  try {
    let lines = 0;
    for await (const line of readJsonlLines(filePath)) {
      if (++lines > FIRST_CWD_MAX_LINES) break;
      // Skip the parse on lines that cannot hold a cwd.
      if (!line.includes('"cwd"')) continue;
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed.cwd === "string" && isAbsolute(parsed.cwd)) {
          cwd = resolve(parsed.cwd);
          break;
        }
      } catch { continue; }
    }
  } catch {
    return null;
  }
  firstCwdCache.set(filePath, { cwd, size });
  return cwd;
};

/**
 * The project a session dir belongs to. Claude Code names the dir after the
 * cwd the session was launched in, but a file's own first cwd can differ (a
 * scratch session moved into a project, a worktree started from the repo
 * root). So prefer a cwd whose dir name matches this dir, and fall back to the
 * first cwd found. Reads one file in the common case.
 */
export const resolveDirProject = async (dirPath: string, dirName: string, files: string[]): Promise<string | null> => {
  let fallback: string | null = null;
  for (const file of files) {
    const cwd = await readFirstCwd(join(dirPath, file));
    if (!cwd) continue;
    if (toSessionDirName(cwd) === dirName) return cwd;
    fallback ??= cwd;
  }
  return fallback;
};

export const loadKnownProjects = async (): Promise<Set<string>> => {
  const now = Date.now();
  if (knownProjectsCache && now - knownProjectsCacheTime < KNOWN_PROJECTS_TTL_MS) {
    return knownProjectsCache;
  }
  if (knownProjectsInFlight) return knownProjectsInFlight;

  knownProjectsInFlight = scanKnownProjects().finally(() => {
    knownProjectsInFlight = null;
  });
  return knownProjectsInFlight;
};

const scanKnownProjects = async (): Promise<Set<string>> => {
  const now = Date.now();
  const projects = new Set<string>();
  // Built aside and swapped in at the end, so getProjectSessionsDirs never
  // sees a half-filled map while a refresh is running.
  const nextProjectDirMap = new Map<string, string[]>();

  // Source 1: ~/.claude.json projects map
  try {
    const raw = await readFile(join(homedir(), ".claude.json"), "utf-8");
    const data = JSON.parse(raw);
    for (const p of Object.keys(data.projects ?? {})) {
      projects.add(resolve(p));
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // Expected: file/dir doesn't exist
    } else {
      console.warn("[paths] Unexpected error loading known projects:", err);
    }
  }

  // Source 2: session-meta files
  try {
    const metaDir = join(CLAUDE_DIR, "usage-data", "session-meta");
    const files = await readdir(metaDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const raw = await readFile(join(metaDir, file), "utf-8");
          let projectPath: string | undefined;
          try {
            const data = JSON.parse(raw);
            projectPath = data.project_path;
          } catch {
            // Malformed JSON — extract project_path via regex fallback
            const match = /"project_path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
            if (match) projectPath = match[1];
          }
          if (projectPath && typeof projectPath === "string" && isAbsolute(projectPath)) {
            projects.add(resolve(projectPath));
          }
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

  // Source 3: ~/.claude/projects/ dirs. Every dir that holds a transcript is
  // mapped to a project, so the session scanner reaches every session file.
  try {
    const projectsDir = join(CLAUDE_DIR, "projects");
    const entries = await readdir(projectsDir);
    const seenFiles = new Set<string>();
    for (const entry of entries) {
      if (entry === ".DS_Store" || entry === "-") continue;
      try {
        const dirPath = join(projectsDir, entry);
        const jsonlFiles = (await readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
        for (const f of jsonlFiles) seenFiles.add(join(dirPath, f));
        const projectPath = await resolveDirProject(dirPath, entry, jsonlFiles);
        if (!projectPath) continue;
        projects.add(projectPath);
        const dirs = nextProjectDirMap.get(projectPath) ?? [];
        // The dir named after the path is the primary one (new sessions go there).
        if (entry === toSessionDirName(projectPath)) dirs.unshift(dirPath);
        else dirs.push(dirPath);
        nextProjectDirMap.set(projectPath, dirs);
      } catch { continue; }
    }
    for (const file of firstCwdCache.keys()) {
      if (!seenFiles.has(file)) firstCwdCache.delete(file);
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // Expected: file/dir doesn't exist
    } else {
      console.warn("[paths] Unexpected error loading known projects:", err);
    }
  }

  projectDirMap.clear();
  for (const [cwd, dir] of nextProjectDirMap) projectDirMap.set(cwd, dir);
  knownProjectsCache = projects;
  knownProjectsCacheTime = now;
  return projects;
};

export const validateProjectPath = async (decoded: string): Promise<string | undefined> => {
  // Must be absolute
  if (!isAbsolute(decoded)) return undefined;
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
  snapshotsDir: join(CLAUDE_DIR, "dashboard-snapshots"),
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

/**
 * Every session dir of a project, primary first. Projects with no dir on disk
 * yet get the dir Claude Code would create for them.
 */
export const getProjectSessionsDirs = (projectPath: string): string[] =>
  projectDirMap.get(projectPath) ??
  [join(PATHS.claudeDir, "projects", toSessionDirName(projectPath))];

/** The dir new sessions of a project are written to (see getProjectSessionsDirs). */
export const getProjectSessionsDir = (projectPath: string): string =>
  getProjectSessionsDirs(projectPath)[0];

/**
 * Build/refresh an index of sessionId → absolute JSONL file path by
 * scanning all directories under ~/.claude/projects/.
 */
const ensureSessionFileIndex = async (): Promise<Map<string, string>> => {
  const now = Date.now();
  if (sessionFileIndex && now - sessionFileIndexTime < SESSION_INDEX_TTL_MS) {
    return sessionFileIndex;
  }

  const index = new Map<string, string>();
  const projectsDir = join(CLAUDE_DIR, "projects");
  try {
    const dirs = await readdir(projectsDir);
    for (const dir of dirs) {
      if (dir === ".DS_Store") continue;
      try {
        const dirPath = join(projectsDir, dir);
        const files = await readdir(dirPath);
        for (const file of files) {
          if (file.endsWith(".jsonl")) {
            const sid = file.slice(0, -6); // strip .jsonl
            index.set(sid, join(dirPath, file));
          }
        }
      } catch { continue; }
    }
  } catch { /* projects dir doesn't exist */ }

  sessionFileIndex = index;
  sessionFileIndexTime = now;
  return index;
};

/**
 * Resolve the absolute path to a session's JSONL file.
 * Tries the computed path first, then falls back to the full index.
 */
export const resolveSessionFilePath = async (
  sessionId: string,
  projectPath: string
): Promise<string | null> => {
  // Fast path: computed directory
  const dir = getProjectSessionsDir(projectPath);
  const computed = join(dir, `${sessionId}.jsonl`);
  try {
    const s = await stat(computed);
    if (s.isFile()) return computed;
  } catch { /* not found at computed path */ }

  // Fallback: scan all project directories
  const index = await ensureSessionFileIndex();
  return index.get(sessionId) ?? null;
};
