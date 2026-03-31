import { Hono } from "hono";
import { getProjectPath, getSettingsPath, resolveSessionFilePath } from "../lib/paths";
import { parseSessionJsonl } from "../lib/jsonl-parser";
import { generateInsights } from "../lib/insights";
import { scanPlugins } from "../lib/plugin-scanner";
import { getSessionsForProject } from "../lib/session-scanner";
import type { SessionAnalysis, SessionCostSummary, Insight, ProjectAnalyticsResponse } from "../../shared/types";

type SessionResponse = {
  analysis: SessionAnalysis;
  insights: Insight[];
};

const analytics = new Hono();

analytics.get("/session/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    let projectPath = await getProjectPath(c);

    // If project path validation fails, still try to find the session
    // by ID alone — resolveSessionFilePath has a fallback index
    if (!projectPath) {
      const found = await resolveSessionFilePath(sessionId, "");
      if (!found) {
        return c.json({ error: "Missing ?project= query parameter" }, 400);
      }
      // Use a placeholder project path for settings lookup
      projectPath = "";
    }

    const analysis = await parseSessionJsonl(sessionId, projectPath);

    if (!analysis) {
      return c.json({ error: "Session JSONL not found or empty" }, 404);
    }

    const settingsPath = getSettingsPath(projectPath || undefined);
    const plugins = await scanPlugins(settingsPath);
    const pluginTokenEstimate = plugins
      .filter((p) => p.enabled)
      .reduce((sum, p) => sum + p.estimatedTokens, 0);

    const insights = generateInsights(analysis, pluginTokenEstimate);

    const response: SessionResponse = { analysis, insights };
    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

const toSummary = (analysis: SessionAnalysis, firstPrompt: string): SessionCostSummary => {
  const turns = analysis.turns;

  let totalToolOutputTokens = 0;
  let totalContextGrowth = 0;
  let contextSpikeCount = 0;
  let contextSpikeToolPctSum = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalCacheReadTokens = 0;
  let inputCostUSD = 0;
  let outputCostUSD = 0;
  let cacheWriteCostUSD = 0;
  let cacheReadCostUSD = 0;

  for (const t of turns) {
    totalToolOutputTokens += t.toolOutputTokens;
    totalInputTokens += t.inputTokens;
    totalOutputTokens += t.outputTokens;
    totalCacheWriteTokens += t.cacheCreationTokens;
    totalCacheReadTokens += t.cacheReadTokens;
    inputCostUSD += t.inputCostUSD;
    outputCostUSD += t.outputCostUSD;
    cacheWriteCostUSD += t.cacheWriteCostUSD;
    cacheReadCostUSD += t.cacheReadCostUSD;
  }

  if (turns.length >= 2) {
    const growth = turns[turns.length - 1].totalContextSize - turns[0].totalContextSize;
    if (growth > 0) totalContextGrowth = growth;
  }

  for (let i = 1; i < turns.length; i++) {
    const jump = turns[i].totalContextSize - turns[i - 1].totalContextSize;
    if (jump > 50_000) {
      contextSpikeCount++;
      contextSpikeToolPctSum += jump > 0 ? Math.min((turns[i].toolOutputTokens / jump) * 100, 100) : 0;
    }
  }

  return {
    sessionId: analysis.sessionId,
    startTime: turns[0]?.timestamp ?? "",
    firstPrompt,
    costUSD: analysis.totalCostUSD,
    cacheHitRate: analysis.cacheHitRate,
    peakContextSize: analysis.peakContextSize,
    turnsCount: turns.length,
    modelBreakdown: Object.fromEntries(
      Object.entries(analysis.modelBreakdown).map(([m, s]) => [m, { costUSD: s.costUSD }])
    ),
    systemPromptEstimate: analysis.systemPromptEstimate,
    totalInputTokens,
    totalOutputTokens,
    totalToolOutputTokens,
    totalContextGrowth,
    contextSpikeCount,
    contextSpikeToolPctSum,
    totalCacheWriteTokens,
    totalCacheReadTokens,
    inputCostUSD,
    outputCostUSD,
    cacheWriteCostUSD,
    cacheReadCostUSD,
  };
};

analytics.get("/project", async (c) => {
  try {
    const projectPath = await getProjectPath(c);

    if (!projectPath) {
      return c.json({ error: "Missing ?project= query parameter" }, 400);
    }

    const sessions = await getSessionsForProject(projectPath);

    const sorted = [...sessions].sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    const settingsPath = getSettingsPath(projectPath);
    const plugins = await scanPlugins(settingsPath);
    const pluginTokenEstimate = plugins
      .filter((p) => p.enabled)
      .reduce((sum, p) => sum + p.estimatedTokens, 0);

    const summaries: SessionCostSummary[] = [];

    const BATCH_SIZE = 10;
    for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
      const batch = sorted.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (session) => {
          const analysis = await parseSessionJsonl(session.sessionId, projectPath);
          if (!analysis) return null;
          return toSummary(analysis, session.firstPrompt);
        })
      );
      for (const r of results) {
        if (r) summaries.push(r);
      }
    }

    if (summaries.length === 0) {
      return c.json({ error: "No detailed session data available" }, 404);
    }

    const response: ProjectAnalyticsResponse = {
      sessions: summaries,
      totalSessionCount: sessions.length,
      pluginTokenEstimate,
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { analytics };
