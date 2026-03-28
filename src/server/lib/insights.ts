import type { Insight, SessionAnalysis } from "../../shared/types";

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1_000).toLocaleString()}k`;
};

const formatCost = (cost: number): string => `$${cost.toFixed(2)}`;

export const generateInsights = (
  analysis: SessionAnalysis,
  pluginTokenEstimate?: number
): Insight[] => {
  const insights: Insight[] = [];
  const { turns, totalCostUSD, cacheHitRate, peakContextSize, modelBreakdown } =
    analysis;

  // 1. Context bloat
  if (peakContextSize > 200_000) {
    insights.push({
      id: "context-bloat",
      level: "warning",
      title: "Context window is getting large",
      message: `Your context peaked at ${formatTokenCount(peakContextSize)} tokens. Consider using /compact or splitting into subagents.`,
      category: "context",
    });
  }

  // 2. Low cache hit rate
  if (turns.length > 2 && cacheHitRate < 0.6) {
    insights.push({
      id: "low-cache-rate",
      level: "warning",
      title: "Low prompt cache hit rate",
      message: `Only ${Math.round(cacheHitRate * 100)}% of tokens were cached. Frequent code edits between turns break prompt caching.`,
      category: "cache",
    });
  }

  // 3. Opus-heavy spending
  const opusCost = Object.entries(modelBreakdown)
    .filter(([model]) => model.toLowerCase().includes("opus"))
    .reduce((sum, [, stats]) => sum + stats.costUSD, 0);

  if (totalCostUSD > 0 && opusCost / totalCostUSD > 0.8) {
    const pct = Math.round((opusCost / totalCostUSD) * 100);
    insights.push({
      id: "opus-heavy",
      level: "tip",
      title: "Most spend is on Opus",
      message: `${pct}% of cost is on Opus (${formatCost(opusCost)}). Use \`/model sonnet\` for routine code edits.`,
      category: "model",
    });
  }

  // 4. Marathon session
  if (turns.length > 50) {
    insights.push({
      id: "marathon-session",
      level: "warning",
      title: "Marathon session detected",
      message: `This session had ${turns.length} turns. Costs compound as context grows \u2014 consider shorter focused sessions.`,
      category: "session",
    });
  }

  // 5. Large initial context (system prompt)
  const { systemPromptEstimate } = analysis;
  if (systemPromptEstimate > 30_000) {
    insights.push({
      id: "large-initial-context",
      level: "info",
      title: "Heavy system prompt",
      message: `Your system prompt is ~${formatTokenCount(systemPromptEstimate)} tokens (CLAUDE.md + plugins + MCP tools). This is loaded on every turn.`,
      category: "context",
    });
  }

  // 6. Plugin overhead
  if (pluginTokenEstimate !== undefined && pluginTokenEstimate > 100_000) {
    insights.push({
      id: "plugin-overhead",
      level: "tip",
      title: "Plugin token overhead is high",
      message: `Enabled plugins add ~${formatTokenCount(pluginTokenEstimate)} tokens to every turn. Consider disabling unused plugins.`,
      category: "plugins",
    });
  }

  // 7. Subagent cost (uses task agents)
  const totalInput = turns.reduce((sum, t) => sum + t.inputTokens, 0);
  const totalOutput = turns.reduce((sum, t) => sum + t.outputTokens, 0);

  // 8. Output-heavy
  if (totalOutput > totalInput && totalInput > 0) {
    insights.push({
      id: "output-heavy",
      level: "tip",
      title: "Output tokens exceed input",
      message: `This session produced more output tokens than input. Output costs 5x more \u2014 be concise in prompts to get concise responses.`,
      category: "session",
    });
  }

  // 9. Context growth spike — identify tool output vs conversation growth
  for (let i = 1; i < turns.length; i++) {
    const jump = turns[i].totalContextSize - turns[i - 1].totalContextSize;
    if (jump > 50_000) {
      const toolPortion = turns[i].toolOutputTokens;
      const toolPct = jump > 0 ? Math.round((toolPortion / jump) * 100) : 0;
      const cause =
        toolPct > 70
          ? `${toolPct}% from tool output (large file reads or command results)`
          : toolPct > 30
            ? `${toolPct}% from tool output, rest from conversation growth`
            : "mostly from accumulated conversation history";

      insights.push({
        id: `context-growth-spike-${i}`,
        level: "warning",
        title: "Context size spike",
        message: `Context jumped by ${formatTokenCount(jump)} tokens at turn ${i + 1} \u2014 ${cause}.`,
        category: "context",
      });
      // Only report the first spike to avoid noise
      break;
    }
  }

  return insights;
};

// ─── Project-level insights (cross-session analysis) ────────

const formatCostPrecise = (cost: number): string =>
  cost > 0 && cost < 0.01 ? `$${cost.toFixed(3)}` : formatCost(cost);

const LEVEL_ORDER: Record<Insight["level"], number> = {
  warning: 0,
  tip: 1,
  info: 2,
};

export const generateProjectInsights = (
  analyses: SessionAnalysis[],
  pluginTokenEstimate?: number
): Insight[] => {
  if (analyses.length === 0) return [];

  // Sort oldest-first for trend calculations (route passes newest-first)
  const sorted = [...analyses].sort((a, b) => {
    const aTime = a.turns[0]?.timestamp
      ? new Date(a.turns[0].timestamp).getTime()
      : 0;
    const bTime = b.turns[0]?.timestamp
      ? new Date(b.turns[0].timestamp).getTime()
      : 0;
    return aTime - bTime;
  });

  const insights: Insight[] = [];
  const total = sorted.length;

  // 1. Context spike frequency
  let spikeSessionCount = 0;
  let toolPctSum = 0;
  let spikeCount = 0;

  for (const a of sorted) {
    let hadSpike = false;
    for (let i = 1; i < a.turns.length; i++) {
      const jump =
        a.turns[i].totalContextSize - a.turns[i - 1].totalContextSize;
      if (jump > 50_000) {
        hadSpike = true;
        const toolPortion = a.turns[i].toolOutputTokens;
        toolPctSum += jump > 0 ? Math.min((toolPortion / jump) * 100, 100) : 0;
        spikeCount++;
      }
    }
    if (hadSpike) spikeSessionCount++;
  }

  if (spikeSessionCount >= 2) {
    const avgToolPct = spikeCount > 0 ? toolPctSum / spikeCount : 0;
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
  const marathonCount = sorted.filter((a) => a.turns.length > 50).length;
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
      olderHalf.reduce((s, a) => s + a.totalCostUSD, 0) / olderHalf.length;
    const avgNew =
      newerHalf.reduce((s, a) => s + a.totalCostUSD, 0) / newerHalf.length;

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
  const withSysPrompt = sorted.filter((a) => a.systemPromptEstimate > 0);
  if (withSysPrompt.length >= 2) {
    const earliest = withSysPrompt[0];
    const latest = withSysPrompt[withSysPrompt.length - 1];
    const growth =
      latest.systemPromptEstimate - earliest.systemPromptEstimate;
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
  const totalCost = sorted.reduce((s, a) => s + a.totalCostUSD, 0);
  const totalTurns = sorted.reduce((s, a) => s + a.turns.length, 0);

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
  const opusHeavyCount = sorted.filter((a) => {
    const opusCost = Object.entries(a.modelBreakdown)
      .filter(([model]) => model.toLowerCase().includes("opus"))
      .reduce((sum, [, stats]) => sum + stats.costUSD, 0);
    return a.totalCostUSD > 0 && opusCost / a.totalCostUSD > 0.8;
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
  let totalContextGrowth = 0;

  for (const a of sorted) {
    for (const t of a.turns) {
      totalToolOutput += t.toolOutputTokens;
    }
    if (a.turns.length >= 2) {
      const growth =
        a.turns[a.turns.length - 1].totalContextSize -
        a.turns[0].totalContextSize;
      if (growth > 0) totalContextGrowth += growth;
    }
  }

  if (totalContextGrowth > 0 && totalToolOutput > 200_000) {
    const toolPct = Math.min(
      Math.round((totalToolOutput / totalContextGrowth) * 100),
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
    (a) => a.turns.length > 2 && a.cacheHitRate < 0.6
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
