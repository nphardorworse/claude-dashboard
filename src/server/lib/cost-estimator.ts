import type { TokenLevel } from "../../shared/types";

export const DEFAULT_CONTEXT_WINDOW = 200_000;

export const estimateTokens = (bytes: number): number => {
  return Math.ceil(bytes / 3.5);
};

/** Per-plugin/skill threshold: <1% green, 1-5% amber, >5% red */
export const getTokenLevel = (tokens: number, contextWindow = DEFAULT_CONTEXT_WINDOW): TokenLevel => {
  const pct = tokens / contextWindow;
  if (pct < 0.01) return "low";
  if (pct <= 0.05) return "medium";
  return "high";
};

/** Overall health card threshold: <15% green, 15-40% amber, >40% red */
export const getOverallTokenLevel = (tokens: number, contextWindow = DEFAULT_CONTEXT_WINDOW): TokenLevel => {
  const pct = tokens / contextWindow;
  if (pct < 0.15) return "low";
  if (pct <= 0.40) return "medium";
  return "high";
};

/** Map a model string to its context window size */
export const modelToContextWindow = (model: string): number => {
  const lower = model.toLowerCase();
  if (lower.includes("opus") && (lower.includes("4-6") || lower.includes("4.6") || lower.includes("4_6"))) {
    return 1_000_000;
  }
  return 200_000;
};

/** Detect most-used model's context window from sessions with lastModelUsed */
export const detectContextWindowFromSessions = (
  sessions: Array<{ startTime: string; lastModelUsed: string }>
): number | null => {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = sessions.filter(
    (s) => new Date(s.startTime).getTime() > sevenDaysAgo && s.lastModelUsed
  );

  if (recent.length === 0) return null;

  const modelCounts = new Map<string, number>();
  for (const s of recent) {
    modelCounts.set(s.lastModelUsed, (modelCounts.get(s.lastModelUsed) ?? 0) + 1);
  }

  let topModel = "";
  let topCount = 0;
  for (const [model, count] of modelCounts) {
    if (count > topCount) {
      topModel = model;
      topCount = count;
    }
  }

  return topModel ? modelToContextWindow(topModel) : null;
};
