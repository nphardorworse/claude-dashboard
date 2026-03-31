import { readFile } from "fs/promises";
import { resolveSessionFilePath } from "./paths";
import { calculateTurnCost, calculateCostBreakdown } from "./pricing";
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

type WindowedUsage = {
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  lastModel: string;
};

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
  const empty: WindowedUsage = { messages: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, lastModel: "" };
  const filePath = await resolveSessionFilePath(sessionId, projectPath);
  if (!filePath) return empty;

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return empty;
  }

  let messages = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let lastModel = "";

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: {
      type?: string;
      timestamp?: string;
      message?: {
        model?: string;
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
      if (entry.message?.model) lastModel = entry.message.model;
      const usage = entry.message?.usage;
      if (!usage) continue;

      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
      cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
      cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    }
  }

  return { messages, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, lastModel };
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
  // Accumulated across ALL assistant API calls in this turn
  // (a single turn can have many API calls due to tool use loops)
  accInputTokens: number;
  accOutputTokens: number;
  accCacheCreation: number;
  accCacheRead: number;
  accCost: number;
  accModelBreakdown: Record<string, { inputTokens: number; outputTokens: number; costUSD: number }>;
  apiCallCount: number;
  accInputCost: number;
  accOutputCost: number;
  accCacheWriteCost: number;
  accCacheReadCost: number;
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

  // Accumulated across all assistant API calls within the current turn
  let accInputTokens = 0;
  let accOutputTokens = 0;
  let accCacheCreation = 0;
  let accCacheRead = 0;
  let accCost = 0;
  let accModelBreakdown: Record<string, { inputTokens: number; outputTokens: number; costUSD: number }> = {};
  let apiCallCount = 0;
  let accInputCost = 0;
  let accOutputCost = 0;
  let accCacheWriteCost = 0;
  let accCacheReadCost = 0;

  const flushTurn = () => {
    turns.push({
      userPrompt: currentUserPrompt,
      userTimestamp: currentUserTimestamp,
      lastAssistantTimestamp,
      model: lastModel,
      usage: lastUsage!,
      toolsUsed: [...new Set(currentToolsUsed)],
      firstContextSize: firstContextSize >= 0 ? firstContextSize : lastContextSize,
      lastContextSize,
      accInputTokens,
      accOutputTokens,
      accCacheCreation,
      accCacheRead,
      accCost,
      accModelBreakdown,
      apiCallCount,
      accInputCost,
      accOutputCost,
      accCacheWriteCost,
      accCacheReadCost,
    });
  };

  const resetTurn = () => {
    currentToolsUsed = [];
    lastModel = "";
    lastUsage = null;
    lastAssistantTimestamp = "";
    firstContextSize = -1;
    lastContextSize = 0;
    accInputTokens = 0;
    accOutputTokens = 0;
    accCacheCreation = 0;
    accCacheRead = 0;
    accCost = 0;
    accModelBreakdown = {};
    apiCallCount = 0;
    accInputCost = 0;
    accOutputCost = 0;
    accCacheWriteCost = 0;
    accCacheReadCost = 0;
  };

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
        flushTurn();
      }

      // Start new turn
      const text = extractUserText(entry.message?.content);
      currentUserPrompt = text;
      currentUserTimestamp = entry.timestamp ?? "";
      resetTurn();
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

        const model = msg.model ?? "unknown";
        lastModel = model;
        lastUsage = msg.usage;
        lastAssistantTimestamp = entry.timestamp ?? "";

        // Accumulate tokens and cost from EVERY assistant API call
        const turnInput = msg.usage.input_tokens ?? 0;
        const turnOutput = msg.usage.output_tokens ?? 0;
        const turnCacheCreate = msg.usage.cache_creation_input_tokens ?? 0;
        const turnCacheRead = msg.usage.cache_read_input_tokens ?? 0;
        accInputTokens += turnInput;
        accOutputTokens += turnOutput;
        accCacheCreation += turnCacheCreate;
        accCacheRead += turnCacheRead;
        const entryCost = calculateTurnCost(model, turnInput, turnOutput, turnCacheCreate, turnCacheRead);
        accCost += entryCost;

        apiCallCount += 1;
        const breakdown = calculateCostBreakdown(model, turnInput, turnOutput, turnCacheCreate, turnCacheRead);
        accInputCost += breakdown.inputCostUSD;
        accOutputCost += breakdown.outputCostUSD;
        accCacheWriteCost += breakdown.cacheWriteCostUSD;
        accCacheReadCost += breakdown.cacheReadCostUSD;

        if (!accModelBreakdown[model]) {
          accModelBreakdown[model] = { inputTokens: 0, outputTokens: 0, costUSD: 0 };
        }
        accModelBreakdown[model].inputTokens += turnInput;
        accModelBreakdown[model].outputTokens += turnOutput;
        accModelBreakdown[model].costUSD += entryCost;
      }
    }
  }

  // Flush final turn
  if (hasPendingUser && lastUsage) {
    flushTurn();
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

  const filePath = await resolveSessionFilePath(sessionId, projectPath);
  if (!filePath) {
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

    // Use accumulated tokens/cost from ALL assistant API calls in the turn
    const inputTokens = rt.accInputTokens;
    const outputTokens = rt.accOutputTokens;
    const cacheCreationTokens = rt.accCacheCreation;
    const cacheReadTokens = rt.accCacheRead;
    const costUSD = rt.accCost;

    // Context size uses the LAST API call's usage (reflects actual context window)
    const lastUsage = rt.usage;
    const totalContextSize =
      (lastUsage.cache_read_input_tokens ?? 0) +
      (lastUsage.cache_creation_input_tokens ?? 0) +
      (lastUsage.input_tokens ?? 0);

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
      apiCallCount: rt.apiCallCount,
      inputCostUSD: rt.accInputCost,
      outputCostUSD: rt.accOutputCost,
      cacheWriteCostUSD: rt.accCacheWriteCost,
      cacheReadCostUSD: rt.accCacheReadCost,
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

    // Merge per-model breakdown from all API calls in this turn
    for (const [model, stats] of Object.entries(rt.accModelBreakdown)) {
      if (!modelBreakdown[model]) {
        modelBreakdown[model] = { inputTokens: 0, outputTokens: 0, costUSD: 0 };
      }
      modelBreakdown[model].inputTokens += stats.inputTokens;
      modelBreakdown[model].outputTokens += stats.outputTokens;
      modelBreakdown[model].costUSD += stats.costUSD;
    }
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
