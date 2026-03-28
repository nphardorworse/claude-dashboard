import { useMemo } from "react";
import { Card, CardContent } from "~/client/components/ui/card";
import type { TopPluginByCost, TokenLevel } from "../../../shared/types";

type CostEstimatorProps = {
  plugins: TopPluginByCost[];
  contextWindowSize?: number;
};

const BAR_COLOR_CLASSES: Record<TokenLevel, string> = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-red-500",
};

const formatTokens = (tokens: number): string => {
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return String(tokens);
};

type CostBarProps = {
  plugin: TopPluginByCost;
  maxTokens: number;
};

const CostBar = ({ plugin, maxTokens }: CostBarProps) => {
  const widthPercent = maxTokens > 0 ? (plugin.estimatedTokens / maxTokens) * 100 : 0;
  const barColorClass = BAR_COLOR_CLASSES[plugin.tokenLevel];

  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 truncate text-sm text-zinc-300">
        {plugin.name}
      </span>
      <div className="flex-1">
        <div className="h-5 w-full rounded-full bg-[var(--overlay-subtle)]">
          <div
            className={`h-5 rounded-full ${barColorClass} transition-[width] duration-300`}
            style={{ width: `${Math.max(widthPercent, 2)}%` }}
          />
        </div>
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-400">
        {formatTokens(plugin.estimatedTokens)}
      </span>
    </div>
  );
};

export const CostEstimator = ({ plugins, contextWindowSize = 200_000 }: CostEstimatorProps) => {
  // Use 10% of context window as the scale reference so bars reflect absolute impact.
  // If any plugin exceeds that, fall back to the max plugin value.
  const maxTokens = useMemo(() => {
    if (plugins.length === 0) return 0;
    const scaleRef = contextWindowSize * 0.1;
    const maxPlugin = Math.max(...plugins.map((p) => p.estimatedTokens));
    return Math.max(scaleRef, maxPlugin);
  }, [plugins, contextWindowSize]);

  if (plugins.length === 0) {
    return (
      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold text-zinc-100">
            Top Plugins by Token Cost
          </h2>
          <p className="text-sm text-zinc-400">No active plugins.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-zinc-100">
            Top Plugins by Token Cost
          </h2>
          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              &lt;1%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
              1-5%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              &gt;5%
            </span>
            <span className="text-zinc-600">of context window</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {plugins.map((plugin) => (
            <CostBar key={plugin.name} plugin={plugin} maxTokens={maxTokens} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
