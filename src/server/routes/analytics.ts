import { Hono } from "hono";
import { getProjectPath, getSettingsPath, resolveSessionFilePath } from "../lib/paths";
import { parseSessionJsonl } from "../lib/jsonl-parser";
import { generateInsights, generateProjectInsights } from "../lib/insights";
import { scanPlugins } from "../lib/plugin-scanner";
import { getSessionsForProject } from "../lib/session-scanner";
import type { SessionAnalysis, Insight } from "../../shared/types";

type SessionResponse = {
  analysis: SessionAnalysis;
  insights: Insight[];
};

type ProjectAnalyticsResponse = {
  totalCostUSD: number;
  avgCostPerSession: number;
  avgCacheHitRate: number;
  peakContextSize: number;
  modelBreakdown: Record<string, { costUSD: number }>;
  topExpensiveSessions: Array<{
    sessionId: string;
    firstPrompt: string;
    costUSD: number;
    turns: number;
  }>;
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

    const recentSessions = sorted.slice(0, 20);

    const settingsPath = getSettingsPath(projectPath);
    const plugins = await scanPlugins(settingsPath);
    const pluginTokenEstimate = plugins
      .filter((p) => p.enabled)
      .reduce((sum, p) => sum + p.estimatedTokens, 0);

    const parsed: Array<{
      analysis: SessionAnalysis;
      firstPrompt: string;
    }> = [];

    for (const session of recentSessions) {
      const analysis = await parseSessionJsonl(
        session.sessionId,
        projectPath
      );
      if (!analysis) continue;
      parsed.push({ analysis, firstPrompt: session.firstPrompt });
    }

    if (parsed.length === 0) {
      return c.json({ error: "No detailed session data available" }, 404);
    }

    let totalCostUSD = 0;
    let cacheHitRateSum = 0;
    let peakContextSize = 0;
    const modelBreakdown: Record<string, { costUSD: number }> = {};

    for (const { analysis } of parsed) {
      totalCostUSD += analysis.totalCostUSD;
      cacheHitRateSum += analysis.cacheHitRate;

      if (analysis.peakContextSize > peakContextSize) {
        peakContextSize = analysis.peakContextSize;
      }

      for (const [model, stats] of Object.entries(analysis.modelBreakdown)) {
        if (!modelBreakdown[model]) {
          modelBreakdown[model] = { costUSD: 0 };
        }
        modelBreakdown[model].costUSD += stats.costUSD;
      }
    }

    const avgCostPerSession = totalCostUSD / parsed.length;
    const avgCacheHitRate = cacheHitRateSum / parsed.length;

    const topExpensiveSessions = [...parsed]
      .sort((a, b) => b.analysis.totalCostUSD - a.analysis.totalCostUSD)
      .slice(0, 5)
      .map(({ analysis, firstPrompt }) => ({
        sessionId: analysis.sessionId,
        firstPrompt,
        costUSD: analysis.totalCostUSD,
        turns: analysis.turns.length,
      }));

    const insights = generateProjectInsights(
      parsed.map((p) => p.analysis),
      pluginTokenEstimate
    );

    const response: ProjectAnalyticsResponse = {
      totalCostUSD,
      avgCostPerSession,
      avgCacheHitRate,
      peakContextSize,
      modelBreakdown,
      topExpensiveSessions,
      insights,
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { analytics };
