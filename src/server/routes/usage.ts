import { Hono } from "hono";
import { basename } from "path";
import { getAllSessions } from "../lib/session-scanner";
import { getPricing } from "../lib/pricing";
import { readJsonFile } from "../lib/file-io";
import { PATHS } from "../lib/paths";
import type { SessionMeta, PlanLimits, UsageWindow, WindowedProjectUsage } from "../../shared/types";

const SONNET_PRICING = getPricing("sonnet");

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const estimateCost = (inputTokens: number, outputTokens: number): number => {
  return (
    (inputTokens / 1_000_000) * SONNET_PRICING.input +
    (outputTokens / 1_000_000) * SONNET_PRICING.output
  );
};

type DashboardConfig = {
  planLimits?: PlanLimits;
  [key: string]: unknown;
};

const readPlanLimits = async (): Promise<PlanLimits> => {
  const config = await readJsonFile<DashboardConfig>(PATHS.dashboardConfig);
  return config?.planLimits ?? { sessionTokenLimit: null, weeklyTokenLimit: null };
};

const aggregateWindow = (
  allSessions: SessionMeta[],
  windowMs: number,
  limit: number | null,
): UsageWindow => {
  const now = Date.now();
  const cutoff = now - windowMs;

  const filtered = allSessions.filter(
    (s) => new Date(s.startTime).getTime() >= cutoff
  );

  const projectMap = new Map<
    string,
    { sessions: number; inputTokens: number; outputTokens: number }
  >();

  let oldestMs = now;

  for (const session of filtered) {
    const ts = new Date(session.startTime).getTime();
    if (ts < oldestMs) oldestMs = ts;

    const key = session.projectPath;
    const existing = projectMap.get(key) ?? { sessions: 0, inputTokens: 0, outputTokens: 0 };
    existing.sessions += 1;
    existing.inputTokens += session.inputTokens;
    existing.outputTokens += session.outputTokens;
    projectMap.set(key, existing);
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  const projects: WindowedProjectUsage[] = [];

  for (const [path, data] of projectMap) {
    const cost = estimateCost(data.inputTokens, data.outputTokens);
    totalInput += data.inputTokens;
    totalOutput += data.outputTokens;
    totalCost += cost;

    projects.push({
      name: basename(path),
      path,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      estimatedCostUSD: cost,
      sessions: data.sessions,
    });
  }

  projects.sort((a, b) => b.totalTokens - a.totalTokens);

  const totalTokens = totalInput + totalOutput;
  const resetsInMs = filtered.length > 0 ? Math.max(0, oldestMs + windowMs - now) : 0;
  const percentage = limit != null && limit > 0 ? (totalTokens / limit) * 100 : null;

  return {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens,
    totalEstimatedCostUSD: totalCost,
    totalSessions: filtered.length,
    limit,
    percentage,
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
      { sessions: number; inputTokens: number; outputTokens: number }
    >();

    for (const session of sessions) {
      const key = session.projectPath;
      const existing = projectMap.get(key) ?? {
        sessions: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      existing.sessions += 1;
      existing.inputTokens += session.inputTokens;
      existing.outputTokens += session.outputTokens;
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
      const cost = estimateCost(data.inputTokens, data.outputTokens);
      totalCost += cost;
      totalInput += data.inputTokens;
      totalOutput += data.outputTokens;

      projects.push({
        name: basename(path),
        path,
        sessions: data.sessions,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        totalTokens: data.inputTokens + data.outputTokens,
        estimatedCostUSD: cost,
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
      pricingBasis: "sonnet" as const,
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

    const session = aggregateWindow(sessions, FIVE_HOURS_MS, limits.sessionTokenLimit);
    const weekly = aggregateWindow(sessions, SEVEN_DAYS_MS, limits.weeklyTokenLimit);

    return c.json({
      session,
      weekly,
      limits,
      pricingBasis: "sonnet" as const,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { usage };
