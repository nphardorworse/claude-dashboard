import { useMemo } from "react";
import type { TurnUsage } from "../../../shared/types";

type ContextCompositionChartProps = {
  turns: TurnUsage[];
  systemPromptEstimate: number;
};

// ─── Composition derivation ──────────────────────────────

type TurnComposition = {
  turnIndex: number;
  system: number;
  history: number;
  toolOutput: number;
  output: number;
  total: number;
  userPrompt: string;
};

const deriveTurnCompositions = (
  turns: TurnUsage[],
  systemEstimate: number
): TurnComposition[] =>
  turns.map((turn) => {
    const system = Math.min(systemEstimate, turn.contextAtStart);
    const history = Math.max(0, turn.contextAtStart - system);
    const toolOutput = turn.toolOutputTokens;
    const output = turn.outputTokens;
    const total = system + history + toolOutput + output;

    return {
      turnIndex: turn.turnIndex,
      system,
      history,
      toolOutput,
      output,
      total,
      userPrompt: turn.userPrompt,
    };
  });

// ─── Formatting ──────────────────────────────────────────

const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
};

// ─── Segment colors ──────────────────────────────────────

const SEGMENTS = {
  system: { color: "bg-zinc-400/60", label: "System / Plugins" },
  history: { color: "bg-cyan-500/60", label: "Conversation" },
  toolOutput: { color: "bg-amber-500/70", label: "Tool Output" },
  output: { color: "bg-rose-500/60", label: "Output" },
} as const;

type SegmentKey = keyof typeof SEGMENTS;

// ─── Sub-components ──────────────────────────────────────

type LegendDotProps = {
  segmentKey: SegmentKey;
};

const LegendDot = ({ segmentKey }: LegendDotProps) => {
  const seg = SEGMENTS[segmentKey];
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2.5 w-2.5 rounded-sm ${seg.color}`} />
      <span className="text-[10px] text-zinc-500">{seg.label}</span>
    </div>
  );
};

const Legend = () => (
  <div className="flex flex-wrap gap-4">
    <LegendDot segmentKey="system" />
    <LegendDot segmentKey="history" />
    <LegendDot segmentKey="toolOutput" />
    <LegendDot segmentKey="output" />
  </div>
);

type ColumnBarProps = {
  comp: TurnComposition;
  maxTotal: number;
};

const ColumnBar = ({ comp, maxTotal }: ColumnBarProps) => {
  const heightPct = maxTotal > 0 ? (comp.total / maxTotal) * 100 : 0;

  const segments: { key: SegmentKey; pct: number; tokens: number }[] = [];
  if (comp.total > 0) {
    if (comp.output > 0) {
      segments.push({ key: "output", pct: (comp.output / comp.total) * 100, tokens: comp.output });
    }
    if (comp.toolOutput > 0) {
      segments.push({ key: "toolOutput", pct: (comp.toolOutput / comp.total) * 100, tokens: comp.toolOutput });
    }
    if (comp.history > 0) {
      segments.push({ key: "history", pct: (comp.history / comp.total) * 100, tokens: comp.history });
    }
    if (comp.system > 0) {
      segments.push({ key: "system", pct: (comp.system / comp.total) * 100, tokens: comp.system });
    }
  }

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
              className={`${SEGMENTS[seg.key].color} w-full shrink-0`}
              style={{ height: `${seg.pct}%` }}
            />
          ))}
        </div>
      </div>
      <span className="text-[8px] tabular-nums text-zinc-600">
        {comp.turnIndex + 1}
      </span>

      {/* Hover tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg bg-zinc-800 px-3 py-2 opacity-0 shadow-xl ring-1 ring-[var(--border-hairline)] transition-opacity duration-200 group-hover/col:opacity-100">
        {comp.userPrompt && (
          <p className="mb-1 max-w-[240px] truncate text-[10px] font-medium text-zinc-200">
            {comp.userPrompt}
          </p>
        )}
        <p className="mb-1 text-[10px] font-semibold text-zinc-300">
          Turn {comp.turnIndex + 1} &middot; {formatTokens(comp.total)}
        </p>
        <div className="flex flex-col gap-0.5">
          {segments.map((seg) => (
            <span key={seg.key} className="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-zinc-400">
              <span className={`inline-block h-1.5 w-1.5 rounded-sm ${SEGMENTS[seg.key].color}`} />
              {SEGMENTS[seg.key].label}: {formatTokens(seg.tokens)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────

export const ContextCompositionChart = ({
  turns,
  systemPromptEstimate,
}: ContextCompositionChartProps) => {
  const compositions = useMemo(
    () => deriveTurnCompositions(turns, systemPromptEstimate),
    [turns, systemPromptEstimate]
  );

  const maxTotal = useMemo(
    () => Math.max(...compositions.map((c) => c.total), 1),
    [compositions]
  );

  if (compositions.length === 0) {
    return (
      <p className="text-xs text-zinc-500">No composition data available.</p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-300">
          Context Composition per Turn
        </h4>
        <Legend />
      </div>

      {systemPromptEstimate > 0 && (
        <p className="mb-2 text-[10px] text-zinc-500">
          Base system prompt: ~{formatTokens(systemPromptEstimate)} tokens
          <span className="text-zinc-600"> (CLAUDE.md + plugins + MCP tools)</span>
        </p>
      )}

      <div className="flex items-end gap-[2px]" style={{ height: 120 }}>
        {compositions.map((comp) => (
          <ColumnBar
            key={comp.turnIndex}
            comp={comp}
            maxTotal={maxTotal}
          />
        ))}
      </div>
    </div>
  );
};
