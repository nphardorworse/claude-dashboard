import { readdir, readFile, stat } from "fs/promises";
import { join, basename } from "path";
import { PATHS, getProjectSessionsDir, loadKnownProjects } from "./paths";
import { readJsonFile } from "./file-io";

export type SessionMeta = {
  sessionId: string;
  projectPath: string;
  startTime: string;
  durationMinutes: number;
  userMessages: number;
  assistantMessages: number;
  toolCounts: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  firstPrompt: string;
  gitCommits: number;
  linesAdded: number;
  linesRemoved: number;
  filesModified: number;
  usesMcp: boolean;
  usesWebSearch: boolean;
  usesTaskAgent: boolean;
  toolErrors: number;
};

type RawSessionMeta = {
  session_id?: string;
  project_path?: string;
  start_time?: string;
  duration_minutes?: number;
  user_message_count?: number;
  assistant_message_count?: number;
  tool_counts?: Record<string, number>;
  input_tokens?: number;
  output_tokens?: number;
  first_prompt?: string;
  git_commits?: number;
  lines_added?: number;
  lines_removed?: number;
  files_modified?: number;
  uses_mcp?: boolean;
  uses_web_search?: boolean;
  uses_task_agent?: boolean;
  tool_errors?: number;
};

// ─── Meta-file cache (existing session-meta/*.json) ────────

const META_CACHE_TTL_MS = 10_000;

let cachedMetaSessions: SessionMeta[] | null = null;
let metaCacheTimestamp = 0;

const parseSession = (raw: RawSessionMeta): SessionMeta | null => {
  if (!raw.session_id || !raw.project_path || !raw.start_time) return null;

  return {
    sessionId: raw.session_id,
    sessionName: (raw as Record<string, unknown>).session_name as string ?? "",
    projectPath: raw.project_path,
    startTime: raw.start_time,
    durationMinutes: raw.duration_minutes ?? 0,
    userMessages: raw.user_message_count ?? 0,
    assistantMessages: raw.assistant_message_count ?? 0,
    toolCounts: raw.tool_counts ?? {},
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    firstPrompt: raw.first_prompt ?? "",
    gitCommits: raw.git_commits ?? 0,
    linesAdded: raw.lines_added ?? 0,
    linesRemoved: raw.lines_removed ?? 0,
    filesModified: raw.files_modified ?? 0,
    usesMcp: raw.uses_mcp ?? false,
    usesWebSearch: raw.uses_web_search ?? false,
    usesTaskAgent: raw.uses_task_agent ?? false,
    toolErrors: raw.tool_errors ?? 0,
  };
};

const loadMetaSessions = async (): Promise<SessionMeta[]> => {
  const now = Date.now();
  if (cachedMetaSessions && now - metaCacheTimestamp < META_CACHE_TTL_MS) {
    return cachedMetaSessions;
  }

  try {
    const files = await readdir(PATHS.sessionMeta);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const results = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = join(PATHS.sessionMeta, file);
        const raw = await readJsonFile<RawSessionMeta>(filePath);
        if (!raw) return null;
        return parseSession(raw);
      })
    );

    const sessions = results.filter(
      (s): s is SessionMeta => s !== null
    );

    cachedMetaSessions = sessions;
    metaCacheTimestamp = Date.now();

    return sessions;
  } catch {
    return [];
  }
};

// ─── JSONL lightweight scanner ─────────────────────────────

type JsonlCacheEntry = {
  result: SessionMeta;
  mtimeMs: number;
  size: number;
};

const jsonlCache = new Map<string, JsonlCacheEntry>();

type JsonlEntry = {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  message?: {
    role?: string;
    model?: string;
    content?: string | { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
};

const extractFirstUserText = (content: unknown): string => {
  if (typeof content === "string") return content.slice(0, 200);
  if (Array.isArray(content)) {
    for (const block of content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as { type?: string }).type === "text" &&
        typeof (block as { text?: string }).text === "string"
      ) {
        return ((block as { text: string }).text).slice(0, 200);
      }
    }
  }
  return "";
};

const parseJsonlForMeta = async (
  filePath: string,
  projectPath: string
): Promise<SessionMeta | null> => {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = raw.split("\n");

  let sessionId = "";
  let sessionName = "";
  let startTime = "";
  let lastTimestamp = "";
  let firstPrompt = "";
  let userMessages = 0;
  let assistantMessages = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCounts: Record<string, number> = {};
  let toolErrors = 0;
  let usesMcp = false;
  let usesWebSearch = false;
  let usesTaskAgent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: JsonlEntry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // Capture sessionId, startTime, and session name
    if (!sessionId && entry.sessionId) {
      sessionId = entry.sessionId;
    }
    if (!startTime && entry.timestamp) {
      startTime = entry.timestamp;
    }
    if (entry.timestamp) {
      lastTimestamp = entry.timestamp;
    }

    const entryType = entry.type;

    if (
      entryType === "custom-title" &&
      (entry as { customTitle?: string }).customTitle
    ) {
      sessionName = (entry as { customTitle: string }).customTitle;
    }

    if (entryType === "user") {
      // Only count real user prompts, not tool_result entries
      const content = entry.message?.content;
      const isToolResult = Array.isArray(content) && content.length > 0 &&
        content.every((b) => typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_result");
      if (!isToolResult) {
        userMessages++;
        if (!firstPrompt && content) {
          firstPrompt = extractFirstUserText(content);
        }
      }
    }

    if (entryType === "assistant") {
      assistantMessages++;
      const usage = entry.message?.usage;
      if (usage) {
        inputTokens += (usage.input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0);
        outputTokens += usage.output_tokens ?? 0;
      }

      // Detect tool use from assistant content
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            typeof block === "object" &&
            block !== null &&
            (block as { type?: string }).type === "tool_use"
          ) {
            const toolName = (block as { name?: string }).name ?? "unknown";
            toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;

            if (toolName === "mcp" || toolName.startsWith("mcp__")) {
              usesMcp = true;
            }
            if (toolName === "WebSearch") usesWebSearch = true;
            if (toolName === "Agent") usesTaskAgent = true;
          }
        }
      }
    }

    // Count tool errors from result entries
    if (entryType === "progress") {
      const data = (entry as { data?: { type?: string; error?: boolean } }).data;
      if (data?.type === "tool_result" && data?.error) {
        toolErrors++;
      }
    }
  }

  if (!sessionId || !startTime) return null;

  // Calculate duration from first to last timestamp
  const startMs = new Date(startTime).getTime();
  const endMs = lastTimestamp
    ? new Date(lastTimestamp).getTime()
    : startMs;
  const durationMinutes = Math.round((endMs - startMs) / 60_000);

  return {
    sessionId,
    sessionName,
    projectPath,
    startTime,
    durationMinutes,
    userMessages,
    assistantMessages,
    toolCounts,
    inputTokens,
    outputTokens,
    firstPrompt,
    gitCommits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    filesModified: 0,
    usesMcp,
    usesWebSearch,
    usesTaskAgent,
    toolErrors,
  };
};

const scanProjectJsonlSessions = async (
  projectPath: string,
  excludeIds: Set<string>
): Promise<SessionMeta[]> => {
  const dir = getProjectSessionsDir(projectPath);

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
  const results: SessionMeta[] = [];

  // Process in parallel batches of 10 to avoid overwhelming I/O
  const BATCH_SIZE = 10;
  for (let i = 0; i < jsonlFiles.length; i += BATCH_SIZE) {
    const batch = jsonlFiles.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        const sessionId = basename(file, ".jsonl");

        // Skip if already covered by session-meta
        if (excludeIds.has(sessionId)) return null;

        const filePath = join(dir, file);

        // Check cache by mtime + size
        let fileStat;
        try {
          fileStat = await stat(filePath);
        } catch {
          return null;
        }

        const cached = jsonlCache.get(sessionId);
        if (
          cached &&
          cached.mtimeMs === fileStat.mtimeMs &&
          cached.size === fileStat.size
        ) {
          return cached.result;
        }

        const meta = await parseJsonlForMeta(filePath, projectPath);
        if (!meta) return null;

        jsonlCache.set(sessionId, {
          result: meta,
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
        });

        return meta;
      })
    );

    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  return results;
};

// ─── Public API ────────────────────────────────────────────

// Cache for the full scan (meta + JSONL across all projects)
const ALL_SESSIONS_CACHE_TTL_MS = 15_000;
let cachedAllSessions: SessionMeta[] | null = null;
let allSessionsCacheTimestamp = 0;

export const getAllSessions = async (): Promise<SessionMeta[]> => {
  const now = Date.now();
  if (cachedAllSessions && now - allSessionsCacheTimestamp < ALL_SESSIONS_CACHE_TTL_MS) {
    return cachedAllSessions;
  }

  // Start with pre-generated meta files
  const metaSessions = await loadMetaSessions();
  const metaIds = new Set(metaSessions.map((s) => s.sessionId));

  // Scan JSONL files across all known projects for sessions missing from meta
  const knownProjects = await loadKnownProjects();
  const jsonlBatches = await Promise.all(
    Array.from(knownProjects).map((projectPath) =>
      scanProjectJsonlSessions(projectPath, metaIds)
    )
  );

  const allJsonl = jsonlBatches.flat();
  const merged = [...metaSessions, ...allJsonl];

  cachedAllSessions = merged;
  allSessionsCacheTimestamp = Date.now();

  return merged;
};

export const getSessionsForProject = async (
  projectPath: string
): Promise<SessionMeta[]> => {
  // Load from pre-generated meta files
  const allMeta = await loadMetaSessions();
  const metaForProject = allMeta.filter(
    (s) => s.projectPath === projectPath
  );
  const metaIds = new Set(metaForProject.map((s) => s.sessionId));

  // Scan JSONL files for sessions not in meta
  const jsonlSessions = await scanProjectJsonlSessions(
    projectPath,
    metaIds
  );

  // Merge: meta sessions + JSONL-only sessions
  return [...metaForProject, ...jsonlSessions];
};
