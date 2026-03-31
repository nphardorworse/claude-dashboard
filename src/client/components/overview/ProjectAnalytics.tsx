import { useState, useEffect, useCallback, useMemo } from "react";
import type { Insight, SessionCostSummary, ProjectAnalyticsResponse } from "../../../shared/types";
import { generateProjectInsights } from "../../../shared/project-insights";
import { buildScopedUrl } from "../../lib/api";
import { InsightCards } from "./InsightCards";
import { Card, CardContent } from "~/client/components/ui/card";
import { CostExplainer } from "../shared/CostExplainer";
import { CostBreakdownTable } from "../shared/CostBreakdownTable";
import type { CostBreakdown } from "../../../shared/types";

// ─── Types ────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "90d" | "all";

type ProjectAnalyticsProps = {
  projectPath: string;
  onSessionClick: (sessionId: string) => void;
};

// ─── Helpers ──────────────────────────────────────────────

const DAYS_MAP: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

const isWithinRange = (isoString: string, range: DateRange): boolean => {
  if (range === "all") return true;
  const cutoff = Date.now() - DAYS_MAP[range] * 86_400_000;
  return new Date(isoString).getTime() >= cutoff;
};

const formatCost = (cost: number): string => {
  if (cost < 0.01 && cost > 0) return "<$0.01";
  if (cost >= 1000) return `$${Math.round(cost).toLocaleString()}`;
  return `$${cost.toFixed(2)}`;
};

const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
};

const truncatePrompt = (prompt: string, maxLen = 50): string => {
  if (!prompt) return "Untitled session";
  if (prompt.length <= maxLen) return prompt;
  return `${prompt.slice(0, maxLen).trimEnd()}...`;
};

const truncateSessionId = (id: string): string => {
  if (id.length <= 8) return id;
  return `${id.slice(0, 8)}...`;
};

const formatShortDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

// ─── Aggregation ──────────────────────────────────────────

const aggregate = (sessions: SessionCostSummary[]) => {
  const count = sessions.length;
  if (count === 0) return null;

  let totalCost = 0;
  let cacheHitSum = 0;
  let peakContext = 0;
  const modelBreakdown: Record<string, number> = {};
  const costBreakdown: CostBreakdown = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    inputCostUSD: 0,
    outputCostUSD: 0,
    cacheWriteCostUSD: 0,
    cacheReadCostUSD: 0,
  };

  for (const s of sessions) {
    totalCost += s.costUSD;
    cacheHitSum += s.cacheHitRate;
    if (s.peakContextSize > peakContext) peakContext = s.peakContextSize;
    for (const [model, stats] of Object.entries(s.modelBreakdown)) {
      modelBreakdown[model] = (modelBreakdown[model] ?? 0) + stats.costUSD;
    }
    costBreakdown.inputTokens += s.totalInputTokens;
    costBreakdown.outputTokens += s.totalOutputTokens;
    costBreakdown.cacheWriteTokens += s.totalCacheWriteTokens;
    costBreakdown.cacheReadTokens += s.totalCacheReadTokens;
    costBreakdown.inputCostUSD += s.inputCostUSD;
    costBreakdown.outputCostUSD += s.outputCostUSD;
    costBreakdown.cacheWriteCostUSD += s.cacheWriteCostUSD;
    costBreakdown.cacheReadCostUSD += s.cacheReadCostUSD;
  }

  const topExpensive = [...sessions]
    .sort((a, b) => b.costUSD - a.costUSD)
    .slice(0, 5);

  return {
    totalCost,
    avgCost: totalCost / count,
    avgCacheHitRate: cacheHitSum / count,
    peakContext,
    modelBreakdown,
    topExpensive,
    count,
    costBreakdown,
  };
};

// ─── Sub-components ───────────────────────────────────────

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

const DateRangeSelector = ({
  active,
  onChange,
}: {
  active: DateRange;
  onChange: (v: DateRange) => void;
}) => (
  <div className="flex rounded-lg ring-1 ring-[var(--border-hairline)] bg-[var(--overlay-faint)]">
    {DATE_RANGE_OPTIONS.map((opt, idx) => {
      const isActive = active === opt.value;
      const isFirst = idx === 0;
      const isLast = idx === DATE_RANGE_OPTIONS.length - 1;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1.5 text-[11px] font-medium transition-[color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${
            isActive
              ? "bg-[var(--overlay-medium)] text-zinc-100 shadow-[inset_0_1px_1px_var(--glow-inset)]"
              : "text-zinc-500 hover:text-zinc-300"
          } ${isFirst ? "rounded-l-lg" : ""} ${isLast ? "rounded-r-lg" : ""}`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

type AnalyticsMetricCardProps = {
  label: string;
  value: string;
};

const AnalyticsMetricCard = ({ label, value }: AnalyticsMetricCardProps) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold tracking-tight text-zinc-50">
        {value}
      </p>
    </CardContent>
  </Card>
);

type ExpensiveSessionRowProps = {
  session: SessionCostSummary;
  rank: number;
  onClick: () => void;
};

const ExpensiveSessionRow = ({ session, rank, onClick }: ExpensiveSessionRowProps) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-snappy hover:bg-[var(--overlay-subtle)]"
  >
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--overlay-medium)] text-[10px] font-semibold text-zinc-400">
      {rank}
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs text-zinc-300">
        {truncatePrompt(session.firstPrompt)}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">
        {truncateSessionId(session.sessionId)} &middot; {session.turnsCount} turns
      </p>
    </div>
    <span className="shrink-0 font-mono text-xs font-semibold text-zinc-200">
      {formatCost(session.costUSD)}
    </span>
  </button>
);

// ─── Main component ───────────────────────────────────────

export const ProjectAnalytics = ({ projectPath, onSessionClick }: ProjectAnalyticsProps) => {
  const [raw, setRaw] = useState<ProjectAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [range, setRange] = useState<DateRange>("30d");

  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      setHasError(false);

      const url = buildScopedUrl("/api/analytics/project", projectPath);
      const res = await fetch(url);

      if (!res.ok) {
        setHasError(true);
        return;
      }

      const json: ProjectAnalyticsResponse = await res.json();
      setRaw(json);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const filtered = useMemo(
    () => raw?.sessions.filter((s) => isWithinRange(s.startTime, range)) ?? [],
    [raw, range]
  );

  const stats = useMemo(() => aggregate(filtered), [filtered]);

  const dateSpan = useMemo(() => {
    if (filtered.length === 0) return null;
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    return {
      first: formatShortDate(sorted[0].startTime),
      last: formatShortDate(sorted[sorted.length - 1].startTime),
    };
  }, [filtered]);

  const insights = useMemo(
    () => (filtered.length > 0 ? generateProjectInsights(filtered, raw?.pluginTokenEstimate) : []),
    [filtered, raw?.pluginTokenEstimate]
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Cost Analytics</h3>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-hairline)] border-t-indigo-500" />
            <span className="text-xs text-zinc-400">Analyzing sessions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasError || !raw) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Cost Analytics</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {filtered.length} of {raw.totalSessionCount} session{raw.totalSessionCount !== 1 ? "s" : ""}
              {filtered.length < raw.sessions.length && <> ({raw.sessions.length} have JSONL data)</>}
              {dateSpan && <> &middot; {dateSpan.first} &ndash; {dateSpan.last}</>}
            </p>
          </div>
          <DateRangeSelector active={range} onChange={setRange} />
        </div>

        {!stats && (
          <p className="mt-4 text-xs text-zinc-500">No sessions found in this date range.</p>
        )}

        <div className="mt-3">
          <CostExplainer />
        </div>

        {stats && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AnalyticsMetricCard
                label="Total Cost"
                value={formatCost(stats.totalCost)}
              />
              <AnalyticsMetricCard
                label="Avg Cost / Session"
                value={formatCost(stats.avgCost)}
              />
              <AnalyticsMetricCard
                label="Cache Hit Rate"
                value={`${Math.round(stats.avgCacheHitRate * 100)}%`}
              />
              <AnalyticsMetricCard
                label="Peak Context"
                value={formatTokens(stats.peakContext)}
              />
            </div>

            {stats.costBreakdown && (
              <div className="mt-4">
                <CostBreakdownTable data={stats.costBreakdown} />
              </div>
            )}

            {stats.topExpensive.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 text-xs font-semibold text-zinc-300">
                  Most Expensive Sessions
                </h4>
                <div className="flex flex-col gap-0.5">
                  {stats.topExpensive.slice(0, 3).map((session, idx) => (
                    <ExpensiveSessionRow
                      key={session.sessionId}
                      session={session}
                      rank={idx + 1}
                      onClick={() => onSessionClick(session.sessionId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {insights.length > 0 && (
              <div className="mt-5">
                <InsightCards insights={insights} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
