import { readFile, stat } from "fs/promises";
import { resolveSessionFilePath } from "./paths";
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
 * assistant reply, every tool call, and every tool result — so the
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

type JsonlEntry = {
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

/** Extract the session name from custom-title JSONL entries. */
export const extractSessionName = (raw: string): string => {
  let name = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as JsonlEntry;
      if (entry.type === "custom-title" && entry.customTitle) {
        name = entry.customTitle;
      }
    } catch {
      continue;
    }
  }
  return name;
};

/**
 * Filter JSONL to keep only conversation-level entries:
 * - user entries with actual text (not tool-result-only)
 * - assistant entries with text content (not tool-call-only internals)
 * - summary entries
 * - custom-title entries (metadata)
 */
export const filterConversationJsonl = (raw: string): string => {
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: JsonlEntry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const t = entry.type;

    // Always keep summaries and custom-title metadata
    if (t === "summary" || t === "custom-title") {
      kept.push(trimmed);
      continue;
    }

    if (t === "user") {
      // Skip tool-result-only user entries
      if (isToolResultOnly(entry.message?.content)) continue;
      const text = extractText(entry.message?.content);
      if (text.trim()) {
        kept.push(trimmed);
      }
      continue;
    }

    if (t === "assistant") {
      const text = extractText(entry.message?.content);
      // Only keep assistant entries that have visible text
      if (text.trim()) {
        kept.push(trimmed);
      }
      continue;
    }
  }
  return kept.join("\n");
};

export const parseTranscriptFromJsonl = (
  raw: string,
  sessionId: string,
  projectPath: string,
): TranscriptResponse => {
  const entries: TranscriptEntry[] = [];
  const lines = raw.split("\n");

  let startTime = "";
  let endTime = "";
  let userCount = 0;
  let assistantCount = 0;
  let idx = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: JsonlEntry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (entry.timestamp) {
      if (!startTime) startTime = entry.timestamp;
      endTime = entry.timestamp;
    }

    const entryType = entry.type;

    // Compaction summaries — preserve them so users can see what the
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
      continue;
    }

    if (entryType !== "user" && entryType !== "assistant") continue;

    const content = entry.message?.content;

    if (entryType === "user") {
      // User "entries" with only tool_result blocks are tool outputs —
      // attach them to the preceding assistant entry instead of creating
      // a new user turn.
      if (isToolResultOnly(content)) {
        const results = extractToolResults(content);
        if (results.length > 0 && entries.length > 0) {
          const last = entries[entries.length - 1];
          last.toolResults.push(...results);
        }
        continue;
      }

      const text = extractText(content);
      if (!text && !Array.isArray(content)) continue;

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
      continue;
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
  }

  return {
    sessionId,
    projectPath,
    startTime,
    endTime,
    entries,
    totalUserMessages: userCount,
    totalAssistantMessages: assistantCount,
    rawBytes: Buffer.byteLength(raw, "utf-8"),
  };
};

export const loadTranscript = async (
  sessionId: string,
  projectPath: string,
): Promise<{ transcript: TranscriptResponse; raw: string } | null> => {
  const filePath = await resolveSessionFilePath(sessionId, projectPath);
  if (!filePath) return null;

  try {
    await stat(filePath);
  } catch {
    return null;
  }

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const transcript = parseTranscriptFromJsonl(raw, sessionId, projectPath);
  return { transcript, raw };
};
