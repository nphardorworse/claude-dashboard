import { useState, useEffect, useCallback, useMemo } from "react";
import type { Insight } from "../../../shared/types";
import { buildScopedUrl } from "../../lib/api";
import { InsightCards } from "./InsightCards";
import { Card, CardContent } from "~/client/components/ui/card";

type ProjectAnalyticsProps = {
  projectPath: string;
  onSessionClick: (sessionId: string) => void;
};

type ExpensiveSession = {
  sessionId: string;
  firstPrompt: string;
  costUSD: number;
  turns: number;
};

type ProjectAnalyticsData = {
  totalCostUSD: number;
  avgCostPerSession: number;
  avgCacheHitRate: number;
  peakContextSize: number;
  modelBreakdown: Record<string, { costUSD: number }>;
  topExpensiveSessions: ExpensiveSession[];
  insights: Insight[];
};

const formatCost = (cost: number): string => {
  if (cost < 0.01 && cost > 0) return "<$0.01";
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
  return `${prompt.slice(0, maxLen).trimEnd()  }...`;
};

const truncateSessionId = (id: string): string => {
  if (id.length <= 8) return id;
  return `${id.slice(0, 8)  }...`;
};

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
  session: ExpensiveSession;
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
        {truncateSessionId(session.sessionId)} &middot; {session.turns} turns
      </p>
    </div>
    <span className="shrink-0 font-mono text-xs font-semibold text-zinc-200">
      {formatCost(session.costUSD)}
    </span>
  </button>
);

export const ProjectAnalytics = ({ projectPath, onSessionClick }: ProjectAnalyticsProps) => {
  const [data, setData] = useState<ProjectAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

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

      const json: ProjectAnalyticsData = await res.json();
      setData(json);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const topSessions = useMemo(
    () => (data ? data.topExpensiveSessions.slice(0, 3) : []),
    [data]
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

  if (hasError || !data) {
    return null;
  }

  return (
    <Card>
    <CardContent className="p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Cost Analytics</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Aggregated from the 20 most recent sessions with JSONL data
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AnalyticsMetricCard
          label="Avg Cost / Session"
          value={formatCost(data.avgCostPerSession)}
        />
        <AnalyticsMetricCard
          label="Cache Hit Rate"
          value={`${Math.round(data.avgCacheHitRate * 100)}%`}
        />
        <AnalyticsMetricCard
          label="Peak Context"
          value={formatTokens(data.peakContextSize)}
        />
        <AnalyticsMetricCard
          label="Total Cost"
          value={formatCost(data.totalCostUSD)}
        />
      </div>

      {topSessions.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 text-xs font-semibold text-zinc-300">
            Most Expensive Sessions
          </h4>
          <div className="flex flex-col gap-0.5">
            {topSessions.map((session, idx) => (
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

      {data.insights.length > 0 && (
        <div className="mt-5">
          <InsightCards insights={data.insights} />
        </div>
      )}
    </CardContent>
    </Card>
  );
};
