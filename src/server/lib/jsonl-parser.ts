import { readFile, stat } from "fs/promises";
import { join } from "path";
import { PATHS } from "./paths";
import { calculateTurnCost } from "./pricing";
import type { TurnUsage, SessionAnalysis } from "../../shared/types";

type UsageBlock = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

const CACHE_TTL_MS = 30_000;
const analysisCache = new Map<
  string,
  { result: SessionAnalysis; timestamp: number }
>();

type WindowedUsage = { messages: number; inputTokens: number; outputTokens: number };

/**
 * Scan a session's JSONL and sum usage for entries after the cutoff.
 *
 * `messages` = user turns (prompts) after the cutoff. Tool-result entries
 * are excluded — only real user prompts count, matching what Anthropic
 * tracks in /usage.
 *
 * Token totals come from ALL assistant entries after the cutoff.
 */
export const sumUsageAfterCutoff = async (
  sessionId: string,
  projectPath: string,
  cutoffMs: number,
): Promise<WindowedUsage> => {
  const filePath = findSessionJsonlPath(sessionId, projectPath);
  if (!filePath) return { messages: 0, inputTokens: 0, outputTokens: 0 };

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return { messages: 0, inputTokens: 0, outputTokens: 0 };
  }

  let messages = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: {
      type?: string;
      timestamp?: string;
      message?: {
        content?: unknown;
        usage?: UsageBlock;
      };
    };
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
    if (ts < cutoffMs) continue;

    if (entry.type === "user") {
      // Skip tool_result entries — only count real user prompts
      if (!isToolResultContent(entry.message?.content)) {
        messages += 1;
      }
      continue;
    }

    if (entry.type === "assistant") {
      const usage = entry.message?.usage;
      if (!usage) continue;

      inputTokens +=
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0);
      outputTokens += usage.output_tokens ?? 0;
    }
  }

  return { messages, inputTokens, outputTokens };
};

/** Check if a user entry's content is purely tool_result blocks (not a real prompt). */
const isToolResultContent = (content: unknown): boolean => {
  if (!Array.isArray(content)) return false;
  return content.length > 0 && content.every(
    (block: unknown) =>
      typeof block === "object" &&
      block !== null &&
      (block as { type?: string }).type === "tool_result"
  );
};

const projectKeyFromPath = (projectPath: string): string => {
  return projectPath.split("/").join("-");
};

export const findSessionJsonlPath = (
  sessionId: string,
  projectPath: string
): string | null => {
  const key = projectKeyFromPath(projectPath);
  const filePath = join(PATHS.claudeDir, "projects", key, `${sessionId}.jsonl`);
  return filePath;
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
};

// ─── JSONL entry parsing helpers ───────────────────────────

type ContentBlock = {
  type?: string;
  text?: string;
  name?: string;
};

type JsonlEntry = {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    model?: string;
    content?: string | ContentBlock[];
    usage?: UsageBlock;
  };
};

const extractUserText = (content: unknown): string => {
  if (typeof content === "string") return content.slice(0, 200);
  if (Array.isArray(content)) {
    for (const block of content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as ContentBlock).type === "text" &&
        typeof (block as ContentBlock).text === "string"
      ) {
        return ((block as ContentBlock).text ?? "").slice(0, 200);
      }
    }
  }
  return "";
};

const isToolResultOnly = (content: unknown): boolean => {
  if (!Array.isArray(content)) return false;
  // If every block is a tool_result, this is not a real user message
  return content.length > 0 && content.every(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      (block as ContentBlock).type === "tool_result"
  );
};

const extractToolNames = (content: unknown): string[] => {
  const tools: string[] = [];
  if (!Array.isArray(content)) return tools;
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as ContentBlock).type === "tool_use" &&
      typeof (block as ContentBlock).name === "string"
    ) {
      tools.push((block as ContentBlock).name!);
    }
  }
  return tools;
};

// ─── Turn builder ──────────────────────────────────────────

type RawTurn = {
  userPrompt: string;
  userTimestamp: string;
  lastAssistantTimestamp: string;
  model: string;
  usage: UsageBlock;
  toolsUsed: string[];
  firstContextSize: number;
  lastContextSize: number;
};

const usageToContextSize = (usage: UsageBlock): number =>
  (usage.input_tokens ?? 0) +
  (usage.cache_creation_input_tokens ?? 0) +
  (usage.cache_read_input_tokens ?? 0);

const buildRawTurns = (lines: string[]): RawTurn[] => {
  const turns: RawTurn[] = [];

  let currentUserPrompt = "";
  let currentUserTimestamp = "";
  let currentToolsUsed: string[] = [];
  let lastModel = "";
  let lastUsage: UsageBlock | null = null;
  let lastAssistantTimestamp = "";
  let firstContextSize = -1;
  let lastContextSize = 0;
  let hasPendingUser = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: JsonlEntry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const entryType = entry.type;

    if (entryType === "user") {
      // Skip tool_result entries — these are API-level responses to
      // tool calls, not actual user prompts
      if (isToolResultOnly(entry.message?.content)) continue;

      // Flush previous turn if we had assistant data
      if (hasPendingUser && lastUsage) {
        turns.push({
          userPrompt: currentUserPrompt,
          userTimestamp: currentUserTimestamp,
          lastAssistantTimestamp,
          model: lastModel,
          usage: lastUsage,
          toolsUsed: [...new Set(currentToolsUsed)],
          firstContextSize: firstContextSize >= 0 ? firstContextSize : lastContextSize,
          lastContextSize,
        });
      }

      // Start new turn
      const text = extractUserText(entry.message?.content);
      currentUserPrompt = text;
      currentUserTimestamp = entry.timestamp ?? "";
      currentToolsUsed = [];
      lastModel = "";
      lastUsage = null;
      lastAssistantTimestamp = "";
      firstContextSize = -1;
      lastContextSize = 0;
      hasPendingUser = true;
      continue;
    }

    if (entryType === "assistant" && entry.message) {
      const msg = entry.message;

      // Collect tool names
      const tools = extractToolNames(msg.content);
      currentToolsUsed.push(...tools);

      // Track context sizes: first and last assistant entries per turn
      if (msg.usage) {
        const ctx = usageToContextSize(msg.usage);
        if (firstContextSize < 0) {
          firstContextSize = ctx;
        }
        lastContextSize = ctx;

        lastModel = msg.model ?? "unknown";
        lastUsage = msg.usage;
        lastAssistantTimestamp = entry.timestamp ?? "";
      }
    }
  }

  // Flush final turn
  if (hasPendingUser && lastUsage) {
    turns.push({
      userPrompt: currentUserPrompt,
      userTimestamp: currentUserTimestamp,
      lastAssistantTimestamp,
      model: lastModel,
      usage: lastUsage,
      toolsUsed: [...new Set(currentToolsUsed)],
      firstContextSize: firstContextSize >= 0 ? firstContextSize : lastContextSize,
      lastContextSize,
    });
  }

  return turns;
};

// ─── Main parser ───────────────────────────────────────────

export const parseSessionJsonl = async (
  sessionId: string,
  projectPath: string
): Promise<SessionAnalysis | null> => {
  const cacheKey = `${projectPath}:${sessionId}`;
  const now = Date.now();
  const cached = analysisCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const filePath = findSessionJsonlPath(sessionId, projectPath);
  if (!filePath || !(await fileExists(filePath))) {
    return null;
  }

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = raw.split("\n");
  const rawTurns = buildRawTurns(lines);

  if (rawTurns.length === 0) return null;

  // Extract session name from custom-title entries
  let sessionName = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      if (entry.type === "custom-title" && entry.customTitle) {
        sessionName = entry.customTitle;
      }
    } catch {
      continue;
    }
  }

  const turns: TurnUsage[] = [];
  const modelBreakdown: Record<
    string,
    { inputTokens: number; outputTokens: number; costUSD: number }
  > = {};

  let totalCost = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let peakContext = 0;
  let prevContext = 0;
  let contextGrowthSum = 0;

  for (let i = 0; i < rawTurns.length; i++) {
    const rt = rawTurns[i];
    const usage = rt.usage;
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

    const costUSD = calculateTurnCost(
      rt.model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens
    );

    const totalContextSize = cacheReadTokens + cacheCreationTokens + inputTokens;

    const userTs = rt.userTimestamp
      ? new Date(rt.userTimestamp).getTime()
      : 0;
    const assistantTs = rt.lastAssistantTimestamp
      ? new Date(rt.lastAssistantTimestamp).getTime()
      : 0;
    const durationMs =
      userTs > 0 && assistantTs > 0 ? Math.max(0, assistantTs - userTs) : 0;

    const toolOutputTokens = Math.max(0, rt.lastContextSize - rt.firstContextSize);

    turns.push({
      turnIndex: i,
      model: rt.model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      costUSD,
      totalContextSize,
      userPrompt: rt.userPrompt,
      toolsUsed: rt.toolsUsed,
      timestamp: rt.lastAssistantTimestamp || rt.userTimestamp,
      durationMs,
      contextAtStart: rt.firstContextSize,
      toolOutputTokens,
    });

    totalCost += costUSD;
    totalCacheRead += cacheReadTokens;
    totalCacheCreation += cacheCreationTokens;

    if (totalContextSize > peakContext) {
      peakContext = totalContextSize;
    }

    if (i > 0) {
      contextGrowthSum += totalContextSize - prevContext;
    }
    prevContext = totalContextSize;

    if (!modelBreakdown[rt.model]) {
      modelBreakdown[rt.model] = {
        inputTokens: 0,
        outputTokens: 0,
        costUSD: 0,
      };
    }
    modelBreakdown[rt.model].inputTokens += inputTokens;
    modelBreakdown[rt.model].outputTokens += outputTokens;
    modelBreakdown[rt.model].costUSD += costUSD;
  }

  const totalCacheAttempts = totalCacheRead + totalCacheCreation;
  const cacheHitRate =
    totalCacheAttempts > 0 ? totalCacheRead / totalCacheAttempts : 0;

  const contextGrowthRate =
    turns.length > 1 ? contextGrowthSum / (turns.length - 1) : 0;

  // System prompt estimate: turn 1's context before any tool calls
  const systemPromptEstimate =
    rawTurns.length > 0 ? rawTurns[0].firstContextSize : 0;

  const analysis: SessionAnalysis = {
    sessionId,
    sessionName,
    projectPath,
    turns,
    totalCostUSD: totalCost,
    cacheHitRate,
    contextGrowthRate,
    peakContextSize: peakContext,
    systemPromptEstimate,
    modelBreakdown,
  };

  analysisCache.set(cacheKey, { result: analysis, timestamp: Date.now() });

  return analysis;
};
