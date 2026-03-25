import { useMemo } from "react";
import type { TurnUsage } from "../../../shared/types";

type ContextGrowthChartProps = {
  turns: TurnUsage[];
};

const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
};

const SEGMENT_COLORS = {
  cacheRead: "bg-emerald-500/80",
  cacheCreation: "bg-amber-500/80",
  input: "bg-blue-500/80",
  output: "bg-rose-500/80",
} as const;

// ─── Legend ──────────────────────────────────────────────

type LegendItemProps = {
  colorClass: string;
  label: string;
};

const LegendItem = ({ colorClass, label }: LegendItemProps) => (
  <div className="flex items-center gap-1.5">
    <div className={`h-2.5 w-2.5 rounded-sm ${colorClass}`} />
    <span className="text-[10px] text-zinc-500">{label}</span>
  </div>
);

const Legend = () => (
  <div className="flex flex-wrap gap-4">
    <LegendItem colorClass={SEGMENT_COLORS.cacheRead} label="Cache read" />
    <LegendItem colorClass={SEGMENT_COLORS.cacheCreation} label="Cache write" />
    <LegendItem colorClass={SEGMENT_COLORS.input} label="Input" />
    <LegendItem colorClass={SEGMENT_COLORS.output} label="Output" />
  </div>
);

// ─── Column bar (vertical, turns on X-axis) ─────────────

type ColumnBarProps = {
  turn: TurnUsage;
  maxContext: number;
};

const ColumnBar = ({ turn, maxContext }: ColumnBarProps) => {
  const totalBar =
    turn.cacheReadTokens +
    turn.cacheCreationTokens +
    turn.inputTokens +
    turn.outputTokens;
  const heightPct = maxContext > 0 ? (totalBar / maxContext) * 100 : 0;

  // Bottom-to-top: cache read, cache creation, input, output
  const segments = useMemo(() => {
    if (totalBar === 0) return [];
    const result: { key: string; cls: string; pct: number; tokens: number; label: string }[] = [];

    if (turn.outputTokens > 0) {
      result.push({
        key: "output",
        cls: SEGMENT_COLORS.output,
        pct: (turn.outputTokens / totalBar) * 100,
        tokens: turn.outputTokens,
        label: "Output",
      });
    }
    if (turn.inputTokens > 0) {
      result.push({
        key: "input",
        cls: SEGMENT_COLORS.input,
        pct: (turn.inputTokens / totalBar) * 100,
        tokens: turn.inputTokens,
        label: "Input",
      });
    }
    if (turn.cacheCreationTokens > 0) {
      result.push({
        key: "cacheCreation",
        cls: SEGMENT_COLORS.cacheCreation,
        pct: (turn.cacheCreationTokens / totalBar) * 100,
        tokens: turn.cacheCreationTokens,
        label: "Cache write",
      });
    }
    if (turn.cacheReadTokens > 0) {
      result.push({
        key: "cacheRead",
        cls: SEGMENT_COLORS.cacheRead,
        pct: (turn.cacheReadTokens / totalBar) * 100,
        tokens: turn.cacheReadTokens,
        label: "Cache read",
      });
    }

    return result;
  }, [turn, totalBar]);

  return (
    <div className="group/col relative flex flex-1 flex-col items-center gap-1">
      <div className="flex w-full items-end justify-center" style={{ height: 100 }}>
        <div
          className="flex w-full flex-col overflow-hidden rounded-t-sm transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ height: `${Math.max(heightPct, 2)}%` }}
        >
          {segments.map((seg) => (
            <div
              key={seg.key}
              className={`${seg.cls} w-full shrink-0`}
              style={{ height: `${seg.pct}%` }}
            />
          ))}
        </div>
      </div>
      <span className="text-[8px] tabular-nums text-zinc-500">
        {turn.turnIndex + 1}
      </span>

      {/* Hover tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg bg-[var(--overlay-medium)] px-3 py-2 opacity-0 shadow-xl ring-1 ring-[var(--border-hairline)] transition-opacity duration-200 group-hover/col:opacity-100">
        <p className="mb-1 text-[10px] font-semibold text-zinc-300">
          Turn {turn.turnIndex + 1} &middot; {formatTokens(turn.totalContextSize)}
        </p>
        <div className="flex flex-col gap-0.5">
          {segments.map((seg) => (
            <span key={seg.key} className="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-zinc-400">
              <span className={`inline-block h-1.5 w-1.5 rounded-sm ${seg.cls}`} />
              {seg.label}: {formatTokens(seg.tokens)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────

export const ContextGrowthChart = ({ turns }: ContextGrowthChartProps) => {
  const maxContext = useMemo(() => {
    let max = 0;
    for (const turn of turns) {
      const total =
        turn.cacheReadTokens +
        turn.cacheCreationTokens +
        turn.inputTokens +
        turn.outputTokens;
      if (total > max) max = total;
    }
    return max;
  }, [turns]);

  if (turns.length === 0) {
    return (
      <p className="text-xs text-zinc-500">No turn data available.</p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-300">
          Context Growth per Turn
        </h4>
        <Legend />
      </div>
      <div className="flex items-end gap-[2px]" style={{ height: 120 }}>
        {turns.map((turn) => (
          <ColumnBar
            key={turn.turnIndex}
            turn={turn}
            maxContext={maxContext}
          />
        ))}
      </div>
    </div>
  );
};
