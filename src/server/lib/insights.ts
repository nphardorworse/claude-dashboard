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

// Project-level insights are now in src/shared/project-insights.ts
// for client-side use with per-timeframe filtering.
