import { stat } from "fs/promises";
import { resolveSessionFilePath } from "./paths";
import { forEachJsonlEntry } from "./jsonl-stream";
import type {
  TranscriptEntry,
  TranscriptEntryRole,
  TranscriptResponse,
} from "../../shared/types";

/**
 * Parse a session JSONL into a full readable transcript.
 *
 * Unlike jsonl-parser (which builds turn-level usage/cost summaries),
 * this extracts the complete text content of every user prompt, every
 * assistant reply, every tool call, and every tool result, so the
 * user can see what was actually said before any compaction happens.
 */

type ContentBlock = {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
  summary?: string;
};

export type JsonlEntry = {
  type?: string;
  timestamp?: string;
  isCompactSummary?: boolean;
  message?: {
    role?: string;
    model?: string;
    content?: string | ContentBlock[];
  };
  summary?: string;
  customTitle?: string;
};

const extractText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as ContentBlock;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    }
  }
  return parts.join("\n\n");
};

const extractToolUses = (
  content: unknown,
): { name: string; input?: unknown }[] => {
  if (!Array.isArray(content)) return [];
  const uses: { name: string; input?: unknown }[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as ContentBlock;
    if (b.type === "tool_use" && typeof b.name === "string") {
      uses.push({ name: b.name, input: b.input });
    }
  }
  return uses;
};

const extractToolResults = (
  content: unknown,
): { text: string; isError: boolean }[] => {
  if (!Array.isArray(content)) return [];
  const results: { text: string; isError: boolean }[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as ContentBlock;
    if (b.type !== "tool_result") continue;
    const isError = b.is_error === true;
    const inner = b.content;
    if (typeof inner === "string") {
      results.push({ text: inner, isError });
    } else if (Array.isArray(inner)) {
      results.push({ text: extractText(inner), isError });
    } else {
      results.push({ text: "", isError });
    }
  }
  return results;
};

const isToolResultOnly = (content: unknown): boolean => {
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every(
    (b) =>
      typeof b === "object" &&
      b !== null &&
      (b as ContentBlock).type === "tool_result",
  );
};

/**
 * True for conversation-level entries kept by conversation-only snapshots:
 * - user entries with actual text (not tool-result-only)
 * - assistant entries with text content (not tool-call-only internals)
 * - summary entries
 * - custom-title entries (metadata)
 */
export const isConversationEntry = (entry: JsonlEntry): boolean => {
  const t = entry.type;
  if (t === "summary" || t === "custom-title") return true;
  if (t === "user") {
    if (isToolResultOnly(entry.message?.content)) return false;
    return extractText(entry.message?.content).trim() !== "";
  }
  if (t === "assistant") {
    return extractText(entry.message?.content).trim() !== "";
  }
  return false;
};

/**
 * Incremental transcript builder: feed parsed entries in file order with
 * `add`, then call `finish` once. Lets callers stream a session file instead
 * of holding it whole (sessions reach 1.5GB, while the text the
 * viewer keeps is usually under 100MB).
 */
export const createTranscriptBuilder = (sessionId: string, projectPath: string) => {
  const entries: TranscriptEntry[] = [];

  let startTime = "";
  let endTime = "";
  let userCount = 0;
  let assistantCount = 0;
  let idx = 0;
  let malformed = 0;
  let orphanToolResults = 0;

  const markMalformed = (): void => {
    malformed++;
  };

  const add = (entry: JsonlEntry): void => {
    if (entry.timestamp) {
      if (!startTime) startTime = entry.timestamp;
      endTime = entry.timestamp;
    }

    const entryType = entry.type;

    // Compaction summaries: preserve them so users can see what the
    // model collapsed the earlier conversation into.
    if (entryType === "summary") {
      const summaryText = entry.summary ?? "";
      if (summaryText) {
        entries.push({
          index: idx++,
          role: "summary",
          timestamp: entry.timestamp ?? "",
          text: summaryText,
          toolUses: [],
          toolResults: [],
        });
      }
      return;
    }

    if (entryType !== "user" && entryType !== "assistant") return;

    const content = entry.message?.content;

    if (entryType === "user") {
      // User "entries" with only tool_result blocks are tool outputs:
      // attach them to the preceding assistant entry instead of creating
      // a new user turn.
      if (isToolResultOnly(content)) {
        const results = extractToolResults(content);
        if (results.length > 0) {
          const last = entries.length > 0 ? entries[entries.length - 1] : null;
          if (last && last.role === "assistant") {
            last.toolResults.push(...results);
          } else {
            orphanToolResults += results.length;
          }
        }
        return;
      }

      const text = extractText(content);
      if (!text && !Array.isArray(content)) return;

      userCount += 1;
      const role: TranscriptEntryRole = entry.isCompactSummary
        ? "summary"
        : "user";

      entries.push({
        index: idx++,
        role,
        timestamp: entry.timestamp ?? "",
        text,
        toolUses: [],
        toolResults: [],
      });
      return;
    }

    // assistant
    assistantCount += 1;
    const text = extractText(content);
    const toolUses = extractToolUses(content);

    entries.push({
      index: idx++,
      role: "assistant",
      timestamp: entry.timestamp ?? "",
      text,
      toolUses,
      toolResults: [],
      model: entry.message?.model,
    });
  };

  const finish = (rawBytes: number): TranscriptResponse => {
    if (malformed > 0) {
      console.warn(
        `[transcript-parser] dropped ${malformed} malformed JSONL lines (sessionId=${sessionId})`,
      );
    }
    if (orphanToolResults > 0) {
      console.warn(
        `[transcript-parser] dropped ${orphanToolResults} orphan tool_result blocks with no preceding assistant entry (sessionId=${sessionId})`,
      );
    }

    return {
      sessionId,
      projectPath,
      startTime,
      endTime,
      entries,
      totalUserMessages: userCount,
      totalAssistantMessages: assistantCount,
      rawBytes,
    };
  };

  return { add, markMalformed, finish };
};

/** Parse JSONL already held in memory (imports, schema 1 snapshots). */
export const parseTranscriptFromJsonl = (
  raw: string,
  sessionId: string,
  projectPath: string,
): TranscriptResponse => {
  const builder = createTranscriptBuilder(sessionId, projectPath);
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: JsonlEntry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      builder.markMalformed();
      continue;
    }
    builder.add(entry);
  }
  return builder.finish(Buffer.byteLength(raw, "utf-8"));
};

/** Stream a JSONL file into a transcript. Throws if the file cannot be read. */
export const loadTranscriptFromFile = async (
  filePath: string,
  sessionId: string,
  projectPath: string,
): Promise<TranscriptResponse> => {
  const { size } = await stat(filePath);
  const builder = createTranscriptBuilder(sessionId, projectPath);
  const ok = await forEachJsonlEntry<JsonlEntry>(filePath, builder.add, builder.markMalformed);
  if (!ok) {
    throw new Error(`[transcript-parser] failed to read ${filePath}`);
  }
  return builder.finish(size);
};

/** Stream a live session's JSONL into a transcript. Null if the file is missing. */
export const loadTranscript = async (
  sessionId: string,
  projectPath: string,
): Promise<TranscriptResponse | null> => {
  const filePath = await resolveSessionFilePath(sessionId, projectPath);
  if (!filePath) return null;
  try {
    return await loadTranscriptFromFile(filePath, sessionId, projectPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    console.error(`[transcript-parser] loadTranscript failed for ${filePath}:`, err);
    throw err;
  }
};
