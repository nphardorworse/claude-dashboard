import { useState, useEffect, useCallback, useMemo } from "react";
import type { SessionAnalysis, Insight, TurnUsage } from "../../../shared/types";
import { buildScopedUrl } from "../../lib/api";
import { ContextGrowthChart } from "./ContextGrowthChart";
import { ContextCompositionChart } from "./ContextCompositionChart";
import { InsightCards } from "./InsightCards";

type SessionDeepDiveProps = {
  sessionId: string;
  projectPath: string;
  onClose: () => void;
};

type SessionApiResponse = {
  analysis: SessionAnalysis;
  insights: Insight[];
};

const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
};

const formatCost = (cost: number): string => {
  if (cost < 0.01 && cost > 0) return `<$0.01`;
  return `$${cost.toFixed(2)}`;
};

const truncateModel = (model: string): string => {
  return model
    .replace("claude-", "")
    .replace("-20250514", "")
    .replace("-20250219", "")
    .replace("-20241022", "")
    .replace("[1m]", "")
    .replace("opus-4-6", "opus-4.6")
    .replace("sonnet-4-5", "sonnet-4.5")
    .replace("haiku-4-5", "haiku-4.5");
};

const truncateSessionId = (id: string): string => {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...`;
};

type MetricCardProps = {
  label: string;
  value: string;
};

const MetricCard = ({ label, value }: MetricCardProps) => (
  <div className="rounded-lg bg-[var(--overlay-subtle)] px-3 py-2">
    <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
      {label}
    </p>
    <p className="mt-0.5 text-sm font-semibold text-zinc-100">{value}</p>
  </div>
);

type ModelBarProps = {
  model: string;
  costUSD: number;
  maxCost: number;
};

const ModelBar = ({ model, costUSD, maxCost }: ModelBarProps) => {
  const widthPercent = maxCost > 0 ? (costUSD / maxCost) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs text-zinc-400">
        {truncateModel(model)}
      </span>
      <div className="h-3 flex-1 rounded-full bg-[var(--overlay-medium)]">
        <div
          className="h-3 rounded-full bg-indigo-500/70 transition-snappy"
          style={{ width: `${Math.max(widthPercent, 2)}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-[10px] text-zinc-400">
        {formatCost(costUSD)}
      </span>
    </div>
  );
};

type ModelBreakdownProps = {
  breakdown: SessionAnalysis["modelBreakdown"];
};

const ModelBreakdown = ({ breakdown }: ModelBreakdownProps) => {
  const sorted = useMemo(
    () =>
      Object.entries(breakdown)
        .sort(([, a], [, b]) => b.costUSD - a.costUSD),
    [breakdown]
  );

  const maxCost = useMemo(
    () => (sorted.length > 0 ? sorted[0][1].costUSD : 0),
    [sorted]
  );

  if (sorted.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-zinc-300">
        Cost by Model
      </h4>
      <div className="flex flex-col gap-1.5">
        {sorted.map(([model, stats]) => (
          <ModelBar
            key={model}
            model={model}
            costUSD={stats.costUSD}
            maxCost={maxCost}
          />
        ))}
      </div>
    </div>
  );
};

const formatDuration = (ms: number): string => {
  if (ms <= 0) return "-";
  if (ms < 1_000) return `${ms}ms`;
  const sec = ms / 1_000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return remSec > 0 ? `${min}m${remSec}s` : `${min}m`;
};

type TurnToolBadgesProps = {
  tools: string[];
};

const TurnToolBadges = ({ tools }: TurnToolBadgesProps) => {
  if (tools.length === 0) {
    return <span className="text-zinc-500">-</span>;
  }

  // Dedupe and count
  const counts = new Map<string, number>();
  for (const t of tools) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const entries = Array.from(counts.entries()).sort(
    ([, a], [, b]) => b - a
  );
  const shown = entries.slice(0, 4);
  const remaining = entries.length - shown.length;

  return (
    <div className="flex flex-wrap gap-0.5">
      {shown.map(([name, count]) => (
        <span
          key={name}
          className="inline-flex items-center gap-0.5 rounded bg-[var(--overlay-medium)] px-1 py-0.5 text-[9px] text-zinc-400"
        >
          {name}
          {count > 1 && (
            <span className="text-zinc-500">&times;{count}</span>
          )}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-[9px] text-zinc-500">+{remaining}</span>
      )}
    </div>
  );
};

type InlineCompositionBarProps = {
  turn: TurnUsage;
  systemEstimate: number;
  maxContext: number;
};

const COMP_SEGMENTS = [
  { key: "sys", label: "System", cls: "bg-zinc-400/60" },
  { key: "hist", label: "History", cls: "bg-cyan-500/60" },
  { key: "tool", label: "Tools", cls: "bg-amber-500/70" },
  { key: "out", label: "Output", cls: "bg-rose-500/60" },
] as const;

const InlineCompositionBar = ({
  turn,
  systemEstimate,
  maxContext,
}: InlineCompositionBarProps) => {
  const system = Math.min(systemEstimate, turn.contextAtStart);
  const history = Math.max(0, turn.contextAtStart - system);
  const toolOut = turn.toolOutputTokens;
  const output = turn.outputTokens;
  const total = system + history + toolOut + output;
  const widthPct = maxContext > 0 ? (total / maxContext) * 100 : 0;

  if (total === 0) return <span className="text-zinc-500">-</span>;

  const values = [system, history, toolOut, output];
  const segs = COMP_SEGMENTS
    .map((s, i) => ({ ...s, tokens: values[i], pct: (values[i] / total) * 100 }))
    .filter((s) => s.pct > 0);

  return (
    <div className="group/bar relative">
      <div
        className="flex h-3 overflow-hidden rounded-sm"
        style={{ width: `${Math.max(widthPct, 4)}%`, minWidth: 8 }}
      >
        {segs.map((s) => (
          <div
            key={s.key}
            className={s.cls}
            style={{ width: `${s.pct}%` }}
          />
        ))}
      </div>
      {/* Hover tooltip */}
      <div className="pointer-events-none absolute bottom-full right-0 z-10 mb-1.5 rounded-lg bg-[var(--overlay-medium)] px-3 py-2 opacity-0 shadow-xl ring-1 ring-[var(--border-hairline)] transition-opacity duration-200 group-hover/bar:opacity-100">
        <div className="flex flex-col gap-0.5">
          {segs.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-zinc-400">
              <span className={`inline-block h-1.5 w-1.5 rounded-sm ${s.cls}`} />
              {s.label}: {formatTokens(s.tokens)}
            </span>
          ))}
        </div>
        <p className="mt-1 border-t border-[var(--border-hairline)] pt-1 text-[9px] text-zinc-500">
          Total: {formatTokens(total)}
        </p>
      </div>
    </div>
  );
};

const CONTEXT_COMMANDS = /^\/(?:compact|clear|reset|model|cost)/i;
const FORK_COMMANDS = /^\/(?:fork|branch)/i;

const isContextCommand = (prompt: string): boolean =>
  CONTEXT_COMMANDS.test(prompt.trim());

const isContextDrop = (
  turn: TurnUsage,
  prevTurn: TurnUsage | undefined
): boolean => {
  if (!prevTurn) return false;
  const prevTotal = prevTurn.contextAtStart + prevTurn.toolOutputTokens + prevTurn.outputTokens;
  return turn.contextAtStart < prevTotal * 0.7;
};

type TurnTableRowProps = {
  turn: TurnUsage;
  prevTurn: TurnUsage | undefined;
  systemEstimate: number;
  maxContext: number;
};

const TurnTableRow = ({ turn, prevTurn, systemEstimate, maxContext }: TurnTableRowProps) => {
  const slashCmd = isContextCommand(turn.userPrompt);
  const forkCmd = FORK_COMMANDS.test(turn.userPrompt.trim());
  const ctxDrop = isContextDrop(turn, prevTurn);
  const isOptimization = slashCmd || ctxDrop;

  return (
    <tr className={`border-b text-[10px] ${
      forkCmd
        ? "border-purple-500/20 bg-purple-500/[0.04]"
        : isOptimization
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-[var(--border-hairline)]"
    }`}>
      <td className="px-2 py-1.5 font-mono text-zinc-500">
        {turn.turnIndex + 1}
      </td>
      <td
        className={`max-w-[220px] truncate px-2 py-1.5 ${
          forkCmd
            ? "font-semibold text-purple-400"
            : slashCmd
              ? "font-semibold text-emerald-400"
              : ctxDrop
                ? "text-emerald-300/80"
                : "text-zinc-300"
        }`}
        title={turn.userPrompt || undefined}
      >
        {turn.userPrompt || (
          <span className="text-zinc-500 italic">system</span>
        )}
        {forkCmd && (
          <span className="ml-1.5 text-[9px] text-purple-500/70">
            branched
          </span>
        )}
        {ctxDrop && !slashCmd && !forkCmd && (
          <span className="ml-1.5 text-[9px] text-emerald-500/70">
            context dropped
          </span>
        )}
      </td>
    <td className="px-2 py-1.5">
      <TurnToolBadges tools={turn.toolsUsed} />
    </td>
    <td className="px-2 py-1.5 text-zinc-400">
      {truncateModel(turn.model)}
    </td>
    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-zinc-500">
      {formatDuration(turn.durationMs)}
    </td>
    <td className="px-2 py-1.5 text-right font-mono text-blue-400">
      {formatTokens(turn.inputTokens)}
    </td>
    <td className="px-2 py-1.5 text-right font-mono text-rose-400">
      {formatTokens(turn.outputTokens)}
    </td>
    <td className="px-2 py-1.5 text-right font-mono text-emerald-400">
      {formatTokens(turn.cacheReadTokens)}
    </td>
    <td className="px-2 py-1.5 text-right font-mono text-zinc-200">
      {formatCost(turn.costUSD)}
    </td>
    <td className="w-[140px] min-w-[140px] px-2 py-1.5">
      <InlineCompositionBar
        turn={turn}
        systemEstimate={systemEstimate}
        maxContext={maxContext}
      />
    </td>
  </tr>
  );
};

type TurnTableProps = {
  turns: TurnUsage[];
  systemPromptEstimate: number;
};

const TurnTable = ({ turns, systemPromptEstimate }: TurnTableProps) => {
  const maxContext = useMemo(() => {
    let max = 0;
    for (const t of turns) {
      const sys = Math.min(systemPromptEstimate, t.contextAtStart);
      const hist = Math.max(0, t.contextAtStart - sys);
      const total = sys + hist + t.toolOutputTokens + t.outputTokens;
      if (total > max) max = total;
    }
    return max;
  }, [turns, systemPromptEstimate]);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-zinc-300">
        Per-Turn Breakdown
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--border-accent)]">
              <th className="px-2 py-1.5 text-[10px] font-medium text-zinc-500">
                #
              </th>
              <th className="px-2 py-1.5 text-[10px] font-medium text-zinc-500">
                Prompt
              </th>
              <th className="px-2 py-1.5 text-[10px] font-medium text-zinc-500">
                Tools
              </th>
              <th className="px-2 py-1.5 text-[10px] font-medium text-zinc-500">
                Model
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-zinc-500">
                Latency
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-blue-500/70">
                In
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-rose-500/70">
                Out
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-emerald-500/70">
                Cache
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-zinc-500">
                Cost
              </th>
              <th className="px-2 py-1.5 text-[10px] font-medium text-zinc-500">
                Context
              </th>
            </tr>
          </thead>
          <tbody>
            {turns.map((turn, i) => (
              <TurnTableRow
                key={turn.turnIndex}
                turn={turn}
                prevTurn={i > 0 ? turns[i - 1] : undefined}
                systemEstimate={systemPromptEstimate}
                maxContext={maxContext}
              />
          ))}
        </tbody>
      </table>
    </div>
  </div>
  );
};

const LoadingState = () => (
  <div className="flex items-center gap-2 py-8">
    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-hairline)] border-t-indigo-500" />
    <span className="text-xs text-zinc-400">Analyzing session JSONL...</span>
  </div>
);

const ErrorState = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-faint)] px-4 py-3">
    <p className="text-xs text-zinc-500">{message}</p>
  </div>
);

export const SessionDeepDive = ({
  sessionId,
  projectPath,
  onClose,
}: SessionDeepDiveProps) => {
  const [data, setData] = useState<SessionApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = buildScopedUrl(
        `/api/analytics/session/${sessionId}`,
        projectPath
      );
      const res = await fetch(url);

      if (!res.ok) {
        if (res.status === 404) {
          setError("No detailed data available for this session.");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const json: SessionApiResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, projectPath]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return (
    <tr>
      <td colSpan={8} className="p-0">
        <div className="border-b border-indigo-500/20 bg-[var(--surface-raised)] px-4 py-4">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-zinc-200">
                Session Analysis
              </h3>
              {data?.analysis.sessionName && (
                <span className="rounded bg-[var(--overlay-medium)] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                  {data.analysis.sessionName}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-[10px] text-zinc-500 transition-snappy hover:bg-[var(--overlay-medium)] hover:text-zinc-300"
            >
              Close
            </button>
          </div>

          {isLoading && <LoadingState />}

          {error && <ErrorState message={error} />}

          {!isLoading && !error && data && (
            <div className="flex flex-col gap-5">
              {/* Header metrics */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricCard
                  label="Session ID"
                  value={truncateSessionId(data.analysis.sessionId)}
                />
                <MetricCard
                  label="Total Cost"
                  value={formatCost(data.analysis.totalCostUSD)}
                />
                <MetricCard
                  label="Cache Hit Rate"
                  value={`${Math.round(data.analysis.cacheHitRate * 100)}%`}
                />
                <MetricCard
                  label="Peak Context"
                  value={formatTokens(data.analysis.peakContextSize)}
                />
              </div>

              {/* Context Composition — what's consuming the window */}
              <ContextCompositionChart
                turns={data.analysis.turns}
                systemPromptEstimate={data.analysis.systemPromptEstimate}
              />

              {/* Context Growth — raw token breakdown per turn */}
              <ContextGrowthChart turns={data.analysis.turns} />

              {/* Model breakdown */}
              <ModelBreakdown breakdown={data.analysis.modelBreakdown} />

              {/* Per-turn table */}
              <TurnTable
                turns={data.analysis.turns}
                systemPromptEstimate={data.analysis.systemPromptEstimate}
              />

              {/* Insights */}
              <InsightCards insights={data.insights} />
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};
