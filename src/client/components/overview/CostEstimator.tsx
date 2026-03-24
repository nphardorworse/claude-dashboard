import { useMemo } from "react";
import type { TopPluginByCost, TokenLevel } from "../../../shared/types";

type CostEstimatorProps = {
  plugins: TopPluginByCost[];
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
        <div className="h-5 w-full rounded-full bg-zinc-800">
          <div
            className={`h-5 rounded-full ${barColorClass} transition-all duration-300`}
            style={{ width: `${Math.max(widthPercent, 2)}%` }}
          />
        </div>
      </div>
      <span className="w-16 shrink-0 text-right text-xs text-zinc-400">
        {formatTokens(plugin.estimatedTokens)}
      </span>
    </div>
  );
};

export const CostEstimator = ({ plugins }: CostEstimatorProps) => {
  const maxTokens = useMemo(() => {
    if (plugins.length === 0) return 0;
    return Math.max(...plugins.map((p) => p.estimatedTokens));
  }, [plugins]);

  if (plugins.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          Top Plugins by Token Cost
        </h2>
        <p className="text-sm text-zinc-500">No active plugins.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-4 text-sm font-semibold text-zinc-100">
        Top Plugins by Token Cost
      </h2>
      <div className="flex flex-col gap-2.5">
        {plugins.map((plugin) => (
          <CostBar key={plugin.name} plugin={plugin} maxTokens={maxTokens} />
        ))}
      </div>
    </div>
  );
};
