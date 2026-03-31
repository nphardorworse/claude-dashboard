import { Hono } from "hono";
import { basename } from "path";
import { getAllSessions } from "../lib/session-scanner";
import { sumUsageAfterCutoff } from "../lib/jsonl-parser";
import { calculateTurnCost } from "../lib/pricing";
import { readJsonFile } from "../lib/file-io";
import { PATHS } from "../lib/paths";
import type { SessionMeta, PlanLimits, UsageWindow, WindowedProjectUsage } from "../../shared/types";

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_LIMITS: PlanLimits = {
  sessionMessageLimit: null,
  weeklyMessageLimit: null,
  sessionResetsAt: null,
  weeklyResetsAt: null,
};

type DashboardConfig = {
  planLimits?: PlanLimits;
  [key: string]: unknown;
};

const readPlanLimits = async (): Promise<PlanLimits> => {
  const config = await readJsonFile<DashboardConfig>(PATHS.dashboardConfig);
  return config?.planLimits ?? DEFAULT_LIMITS;
};

/**
 * Resolve session reset from a time-of-day string ("HH:MM").
 * Finds the next occurrence of that time — today if still upcoming, tomorrow if passed.
 * If the computed window doesn't cover the present (cutoff in the future),
 * falls back to a rolling 5hr window — the previous window has ended and the
 * next one's boundaries are unknown until the user checks /usage again.
 */
const resolveSessionWindow = (
  timeStr: string | null,
): { cutoff: number; resetsInMs: number } => {
  const now = Date.now();

  if (timeStr) {
    const parts = timeStr.split(":").map(Number);
    if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      const today = new Date();
      today.setHours(parts[0], parts[1], 0, 0);
      let resetMs = today.getTime();
      if (resetMs <= now) {
        resetMs += 24 * 60 * 60 * 1000;
      }
      const cutoff = resetMs - FIVE_HOURS_MS;
      if (cutoff <= now) {
        return { cutoff, resetsInMs: resetMs - now };
      }
    }
  }

  return { cutoff: now - FIVE_HOURS_MS, resetsInMs: 0 };
};

/**
 * Resolve weekly reset from an ISO timestamp.
 * If the timestamp is in the past, advances by 7-day increments until future.
 */
const resolveWeeklyWindow = (
  isoStr: string | null,
): { cutoff: number; resetsInMs: number } => {
  const now = Date.now();

  if (isoStr) {
    let resetMs = new Date(isoStr).getTime();
    if (!Number.isNaN(resetMs)) {
      while (resetMs <= now) {
        resetMs += SEVEN_DAYS_MS;
      }
      const cutoff = resetMs - SEVEN_DAYS_MS;
      return { cutoff, resetsInMs: resetMs - now };
    }
  }

  return { cutoff: now - SEVEN_DAYS_MS, resetsInMs: 0 };
};

/**
 * Aggregate usage for sessions overlapping [cutoff, now].
 *
 * Primary metric: **messages** (assistant API calls) — this is what
 * Anthropic rate-limits on. Each assistant JSONL entry = 1 API call.
 *
 * - Sessions fully inside the window → use session-level totals (fast).
 * - Sessions spanning the boundary → scan raw JSONL entries after cutoff (exact).
 * - Sessions fully before the window → skipped.
 */
type ProjectAccum = {
  sessions: number;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
};

const aggregateWindow = async (
  allSessions: SessionMeta[],
  cutoff: number,
  messageLimit: number | null,
  resetsInMs: number,
): Promise<UsageWindow> => {
  const projectMap = new Map<string, ProjectAccum>();

  const boundaryParses: Promise<void>[] = [];

  for (const session of allSessions) {
    const startMs = new Date(session.startTime).getTime();
    const endMs = startMs + session.durationMinutes * 60 * 1000;

    if (endMs < cutoff) continue;

    const key = session.projectPath;
    const existing = projectMap.get(key) ?? {
      sessions: 0, messages: 0, inputTokens: 0, outputTokens: 0, costUSD: 0,
    };
    existing.sessions += 1;
    projectMap.set(key, existing);

    if (startMs >= cutoff) {
      // Fully inside window — use pre-computed session cost
      existing.messages += session.userMessages;
      existing.inputTokens += session.inputTokens;
      existing.outputTokens += session.outputTokens;
      existing.costUSD += session.costUSD;
    } else {
      // Spans boundary — scan raw JSONL entries with timestamp filter
      boundaryParses.push(
        sumUsageAfterCutoff(session.sessionId, session.projectPath, cutoff).then((usage) => {
          existing.messages += usage.messages;
          existing.inputTokens += usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens;
          existing.outputTokens += usage.outputTokens;
          existing.costUSD += calculateTurnCost(
            usage.lastModel || "sonnet",
            usage.inputTokens, usage.outputTokens,
            usage.cacheCreationTokens, usage.cacheReadTokens
          );
        })
      );
    }
  }

  await Promise.all(boundaryParses);

  let totalMessages = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  const projects: WindowedProjectUsage[] = [];

  for (const [path, data] of projectMap) {
    totalMessages += data.messages;
    totalInput += data.inputTokens;
    totalOutput += data.outputTokens;
    totalCost += data.costUSD;

    projects.push({
      name: basename(path),
      path,
      messages: data.messages,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      estimatedCostUSD: data.costUSD,
      sessions: data.sessions,
    });
  }

  projects.sort((a, b) => b.messages - a.messages);

  const messagePercentage =
    messageLimit != null && messageLimit > 0
      ? (totalMessages / messageLimit) * 100
      : null;

  return {
    totalMessages,
    messageLimit,
    messagePercentage,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    totalEstimatedCostUSD: totalCost,
    totalSessions: Array.from(projectMap.values()).reduce((sum, p) => sum + p.sessions, 0),
    resetsInMs,
    projects,
  };
};

const usage = new Hono();

usage.get("/", async (c) => {
  try {
    const sessions = await getAllSessions();

    const projectMap = new Map<
      string,
      { sessions: number; inputTokens: number; outputTokens: number; costUSD: number }
    >();

    for (const session of sessions) {
      const key = session.projectPath;
      const existing = projectMap.get(key) ?? {
        sessions: 0, inputTokens: 0, outputTokens: 0, costUSD: 0,
      };
      existing.sessions += 1;
      existing.inputTokens += session.inputTokens;
      existing.outputTokens += session.outputTokens;
      existing.costUSD += session.costUSD;
      projectMap.set(key, existing);
    }

    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;

    const projects: {
      name: string;
      path: string;
      sessions: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUSD: number;
      percentage: number;
    }[] = [];

    for (const [path, data] of projectMap) {
      totalCost += data.costUSD;
      totalInput += data.inputTokens;
      totalOutput += data.outputTokens;

      projects.push({
        name: basename(path),
        path,
        sessions: data.sessions,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        totalTokens: data.inputTokens + data.outputTokens,
        estimatedCostUSD: data.costUSD,
        percentage: 0,
      });
    }

    for (const p of projects) {
      p.percentage =
        totalCost > 0 ? (p.estimatedCostUSD / totalCost) * 100 : 0;
    }

    projects.sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD);

    return c.json({
      totalEstimatedCostUSD: totalCost,
      totalSessions: sessions.length,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      pricingBasis: "per-model" as const,
      dataSource: "session-meta" as const,
      projects,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /windowed — rolling-window usage with per-project breakdown
usage.get("/windowed", async (c) => {
  try {
    const sessions = await getAllSessions();
    const limits = await readPlanLimits();

    const sessionWindow = resolveSessionWindow(limits.sessionResetsAt);
    const weeklyWindow = resolveWeeklyWindow(limits.weeklyResetsAt);

    const [session, weekly] = await Promise.all([
      aggregateWindow(sessions, sessionWindow.cutoff, limits.sessionMessageLimit, sessionWindow.resetsInMs),
      aggregateWindow(sessions, weeklyWindow.cutoff, limits.weeklyMessageLimit, weeklyWindow.resetsInMs),
    ]);

    return c.json({
      session,
      weekly,
      limits,
      pricingBasis: "per-model" as const,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { usage };
