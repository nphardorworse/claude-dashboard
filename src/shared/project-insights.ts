import type { Insight, SessionCostSummary } from "./types";

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1_000).toLocaleString()}k`;
};

const formatCost = (cost: number): string => `$${cost.toFixed(2)}`;

const formatCostPrecise = (cost: number): string =>
  cost > 0 && cost < 0.01 ? `$${cost.toFixed(3)}` : formatCost(cost);

const LEVEL_ORDER: Record<Insight["level"], number> = {
  warning: 0,
  tip: 1,
  info: 2,
};

export const generateProjectInsights = (
  sessions: SessionCostSummary[],
  pluginTokenEstimate?: number
): Insight[] => {
  if (sessions.length === 0) return [];

  // Sort oldest-first for trend calculations
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const insights: Insight[] = [];
  const total = sorted.length;

  // 1. Context spike frequency
  let spikeSessionCount = 0;
  let totalSpikeToolPctSum = 0;
  let totalSpikeCount = 0;

  for (const s of sorted) {
    if (s.contextSpikeCount > 0) {
      spikeSessionCount++;
      totalSpikeToolPctSum += s.contextSpikeToolPctSum;
      totalSpikeCount += s.contextSpikeCount;
    }
  }

  if (spikeSessionCount >= 2) {
    const avgToolPct = totalSpikeCount > 0 ? totalSpikeToolPctSum / totalSpikeCount : 0;
    const cause =
      avgToolPct > 70
        ? "large tool output"
        : avgToolPct > 30
          ? "a mix of tool output and conversation growth"
          : "accumulated conversation history";

    insights.push({
      id: "project-context-spikes",
      level: "warning",
      title: "Frequent context size spikes",
      message: `${spikeSessionCount} of ${total} sessions had context size spikes \u2014 ${cause} is the most common trigger. Use /compact to reclaim context.`,
      category: "context",
    });
  }

  // 2. Marathon session frequency
  const marathonCount = sorted.filter((s) => s.turnsCount > 50).length;
  if (marathonCount >= 2) {
    insights.push({
      id: "project-marathon-sessions",
      level: "warning",
      title: "Frequent marathon sessions",
      message: `${marathonCount} of ${total} sessions exceeded 50 turns. Costs compound as context grows \u2014 consider shorter focused sessions.`,
      category: "session",
    });
  }

  // 3. Cost trend (older half vs newer half)
  if (total >= 10) {
    const mid = Math.floor(total / 2);
    const olderHalf = sorted.slice(0, mid);
    const newerHalf = sorted.slice(mid);
    const avgOld =
      olderHalf.reduce((s, a) => s + a.costUSD, 0) / olderHalf.length;
    const avgNew =
      newerHalf.reduce((s, a) => s + a.costUSD, 0) / newerHalf.length;

    if (avgOld > 0) {
      const pctChange = ((avgNew - avgOld) / avgOld) * 100;
      if (pctChange > 30) {
        insights.push({
          id: "project-cost-trend",
          level: "warning",
          title: "Costs are trending up",
          message: `Your last ${newerHalf.length} sessions cost ${Math.round(pctChange)}% more than the ${olderHalf.length} before that (${formatCost(avgNew)} vs ${formatCost(avgOld)} avg). Check for context bloat or increased Opus usage.`,
          category: "session",
        });
      } else if (pctChange < -30) {
        insights.push({
          id: "project-cost-trend",
          level: "info",
          title: "Costs are trending down",
          message: `Your last ${newerHalf.length} sessions cost ${Math.round(Math.abs(pctChange))}% less than the ${olderHalf.length} before that \u2014 nice efficiency improvement.`,
          category: "session",
        });
      }
    }
  }

  // 4. Cache hit trend (first third vs last third)
  if (total >= 6) {
    const third = Math.floor(total / 3);
    const earlyThird = sorted.slice(0, third);
    const lateThird = sorted.slice(total - third);
    const avgEarly =
      earlyThird.reduce((s, a) => s + a.cacheHitRate, 0) / earlyThird.length;
    const avgLate =
      lateThird.reduce((s, a) => s + a.cacheHitRate, 0) / lateThird.length;
    const dropPct = (avgEarly - avgLate) * 100;

    if (dropPct > 15) {
      insights.push({
        id: "project-cache-trend",
        level: "warning",
        title: "Cache hit rate declining",
        message: `Cache hit rate is declining: ${Math.round(avgEarly * 100)}% \u2192 ${Math.round(avgLate * 100)}% over recent sessions. Frequent code edits between turns break prompt caching.`,
        category: "cache",
      });
    }
  }

  // 5. System prompt growth
  const withSysPrompt = sorted.filter((s) => s.systemPromptEstimate > 0);
  if (withSysPrompt.length >= 2) {
    const earliest = withSysPrompt[0];
    const latest = withSysPrompt[withSysPrompt.length - 1];
    const growth = latest.systemPromptEstimate - earliest.systemPromptEstimate;
    const growthPct =
      earliest.systemPromptEstimate > 0
        ? (growth / earliest.systemPromptEstimate) * 100
        : 0;

    if (growthPct > 20 && growth > 5_000) {
      insights.push({
        id: "project-system-prompt-growth",
        level: "tip",
        title: "System prompt is growing",
        message: `System prompt grew from ${formatTokenCount(earliest.systemPromptEstimate)} to ${formatTokenCount(latest.systemPromptEstimate)} tokens over recent sessions. Review CLAUDE.md and plugins \u2014 everything in the system prompt is loaded every turn.`,
        category: "context",
      });
    }
  }

  // 6. Cost per prompt
  const totalCost = sorted.reduce((s, a) => s + a.costUSD, 0);
  const totalTurns = sorted.reduce((s, a) => s + a.turnsCount, 0);

  if (totalTurns > 0) {
    const costPerPrompt = totalCost / totalTurns;
    const recommendation =
      costPerPrompt > 0.5
        ? "Consider shorter sessions and /model sonnet for routine tasks."
        : costPerPrompt > 0.1
          ? "Keep an eye on long sessions where this compounds."
          : "This is efficient usage.";

    insights.push({
      id: "project-cost-per-prompt",
      level: "info",
      title: "Average cost per prompt",
      message: `Average cost per user prompt: ${formatCostPrecise(costPerPrompt)}. ${recommendation}`,
      category: "session",
    });
  }

  // 7. Opus-heavy cross-session
  const opusHeavyCount = sorted.filter((s) => {
    const opusCost = Object.entries(s.modelBreakdown)
      .filter(([model]) => model.toLowerCase().includes("opus"))
      .reduce((sum, [, stats]) => sum + stats.costUSD, 0);
    return s.costUSD > 0 && opusCost / s.costUSD > 0.8;
  }).length;

  if (opusHeavyCount >= 2 && opusHeavyCount > total / 3) {
    insights.push({
      id: "project-opus-heavy",
      level: "tip",
      title: "Most sessions are Opus-heavy",
      message: `${opusHeavyCount} of ${total} sessions spend >80% on Opus. Use /model sonnet for routine code edits to reduce costs.`,
      category: "model",
    });
  }

  // 8. Tool output dominance
  let totalToolOutput = 0;
  let totalContextGrowthAll = 0;

  for (const s of sorted) {
    totalToolOutput += s.totalToolOutputTokens;
    totalContextGrowthAll += s.totalContextGrowth;
  }

  if (totalContextGrowthAll > 0 && totalToolOutput > 200_000) {
    const toolPct = Math.min(
      Math.round((totalToolOutput / totalContextGrowthAll) * 100),
      100
    );
    if (toolPct > 60) {
      insights.push({
        id: "project-tool-output",
        level: "tip",
        title: "Tool output dominates context growth",
        message: `Tool output accounts for ${toolPct}% of context growth across sessions (${formatTokenCount(totalToolOutput)} tokens). Consider using targeted file reads instead of broad searches.`,
        category: "context",
      });
    }
  }

  // 9. Widespread low cache rates
  const lowCacheCount = sorted.filter(
    (s) => s.turnsCount > 2 && s.cacheHitRate < 0.6
  ).length;

  if (lowCacheCount >= 3 || (total > 0 && lowCacheCount > total / 2)) {
    insights.push({
      id: "project-low-cache-rate",
      level: "warning",
      title: "Widespread low cache hit rates",
      message: `${lowCacheCount} of ${total} sessions had cache hit rates below 60%. Frequent code edits between turns break prompt caching.`,
      category: "cache",
    });
  }

  // 10. Plugin overhead
  if (pluginTokenEstimate !== undefined && pluginTokenEstimate > 100_000) {
    insights.push({
      id: "project-plugin-overhead",
      level: "tip",
      title: "Plugin token overhead is high",
      message: `Enabled plugins add ~${formatTokenCount(pluginTokenEstimate)} tokens to every turn across all sessions. Consider disabling unused plugins to reduce baseline cost.`,
      category: "plugins",
    });
  }

  // Sort by severity (warnings first, then tips, then info) and cap at 8
  insights.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return insights.slice(0, 8);
};
