import { useState, useEffect, useMemo, useCallback } from "react";
import type { SessionMeta, SessionsResponse } from "../../../shared/types";
import { buildScopedUrl } from "../../lib/api";
import { SessionDeepDive } from "./SessionDeepDive";
import { Card, CardContent } from "~/client/components/ui/card";
import { Input } from "~/client/components/ui/input";

// ─── Types ────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "90d" | "all";
type SortField = "date" | "duration" | "messages" | "tokens" | "lines" | "errors";
type SortDirection = "asc" | "desc";
type GroupBy = "none" | "day" | "week";

type SessionGroup = {
  key: string;
  label: string;
  sessions: SessionMeta[];
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMinutes: number;
  sessionCount: number;
};

type SessionHistoryProps = {
  projectPath: string;
  focusSessionId?: string | null;
};

// ─── Formatting helpers ───────────────────────────────────

const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "-";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
};

const formatRelativeDate = (isoString: string): string => {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
};

const truncatePrompt = (prompt: string, maxLen = 60): string => {
  if (!prompt) return "-";
  if (prompt.length <= maxLen) return prompt;
  return `${prompt.slice(0, maxLen).trimEnd()  }...`;
};

const formatDuration = (minutes: number): string => {
  if (minutes === 0) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

// ─── Date helpers ─────────────────────────────────────────

const getDateKey = (isoString: string): string => {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getWeekKey = (isoString: string): string => {
  const d = new Date(isoString);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return getDateKey(monday.toISOString());
};

const formatDateGroupLabel = (dateKey: string): string => {
  const date = new Date(`${dateKey  }T12:00:00`);
  const now = new Date();
  const todayKey = getDateKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday.toISOString());

  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const formatWeekGroupLabel = (weekKey: string): string => {
  const start = new Date(`${weekKey  }T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const thisWeek = getWeekKey(new Date().toISOString());
  if (weekKey === thisWeek) return "This Week";

  const prev = new Date();
  prev.setDate(prev.getDate() - 7);
  if (weekKey === getWeekKey(prev.toISOString())) return "Last Week";

  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startStr} \u2013 ${endStr}`;
};

const isWithinDateRange = (isoString: string, range: DateRange): boolean => {
  if (range === "all") return true;
  const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const cutoff = Date.now() - daysMap[range] * 86_400_000;
  return new Date(isoString).getTime() >= cutoff;
};

// ─── Sorting ──────────────────────────────────────────────

const getSortValue = (s: SessionMeta, field: SortField): number => {
  switch (field) {
    case "date":
      return new Date(s.startTime).getTime();
    case "duration":
      return s.durationMinutes;
    case "messages":
      return s.userMessages + s.assistantMessages;
    case "tokens":
      return s.inputTokens + s.outputTokens;
    case "lines":
      return s.linesAdded + s.linesRemoved;
    case "errors":
      return s.toolErrors;
  }
};

const compareSessions = (
  a: SessionMeta,
  b: SessionMeta,
  field: SortField,
  dir: SortDirection
): number => {
  const va = getSortValue(a, field);
  const vb = getSortValue(b, field);
  return dir === "asc" ? va - vb : vb - va;
};

// ─── Grouping ─────────────────────────────────────────────

const groupSessions = (sessions: SessionMeta[], groupBy: GroupBy): SessionGroup[] => {
  if (groupBy === "none") return [];

  const keyFn = groupBy === "day" ? getDateKey : getWeekKey;
  const labelFn = groupBy === "day" ? formatDateGroupLabel : formatWeekGroupLabel;

  const map = new Map<string, SessionMeta[]>();
  for (const s of sessions) {
    const key = keyFn(s.startTime);
    const arr = map.get(key);
    if (arr) {
      arr.push(s);
    } else {
      map.set(key, [s]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, group]) => ({
      key,
      label: labelFn(key),
      sessions: group,
      totalTokens: group.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0),
      totalInputTokens: group.reduce((sum, s) => sum + s.inputTokens, 0),
      totalOutputTokens: group.reduce((sum, s) => sum + s.outputTokens, 0),
      totalDurationMinutes: group.reduce((sum, s) => sum + s.durationMinutes, 0),
      sessionCount: group.length,
    }));
};

// ─── Sub-components ───────────────────────────────────────

type ToolBadgeProps = {
  name: string;
  count: number;
};

const ToolBadge = ({ name, count }: ToolBadgeProps) => (
  <span className="inline-flex items-center gap-0.5 rounded bg-[var(--overlay-medium)] px-1.5 py-0.5 text-[10px] text-zinc-400">
    {name}: {count}
  </span>
);

type ToolBadgeListProps = {
  toolCounts: Record<string, number>;
};

const ToolBadgeList = ({ toolCounts }: ToolBadgeListProps) => {
  const sorted = useMemo(
    () =>
      Object.entries(toolCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5),
    [toolCounts]
  );

  if (sorted.length === 0) return <span className="text-zinc-500">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map(([name, count]) => (
        <ToolBadge key={name} name={name} count={count} />
      ))}
    </div>
  );
};

// ─── Filter bar ───────────────────────────────────────────

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "List" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
];

type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
};

const SegmentedControl = <T extends string>({
  options,
  active,
  onChange,
}: SegmentedControlProps<T>) => (
  <div className="flex rounded-lg ring-1 ring-[var(--border-hairline)] bg-[var(--overlay-faint)]">
    {options.map((opt, idx) => {
      const isActive = active === opt.value;
      const isFirst = idx === 0;
      const isLast = idx === options.length - 1;
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

type FilterBarProps = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
};

const FilterBar = ({
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  groupBy,
  onGroupByChange,
}: FilterBarProps) => (
  <div className="flex flex-wrap items-center gap-3">
    <Input
      type="text"
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
      placeholder="Search prompts..."
      className="w-48"
    />
    <SegmentedControl options={DATE_RANGE_OPTIONS} active={dateRange} onChange={onDateRangeChange} />
    <div className="ml-auto flex items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        Group
      </span>
      <SegmentedControl options={GROUP_OPTIONS} active={groupBy} onChange={onGroupByChange} />
    </div>
  </div>
);

// ─── Activity chart (grouped view) ───────────────────────

type ActivityChartProps = {
  groups: SessionGroup[];
  groupBy: GroupBy;
};

const ActivityChart = ({ groups, groupBy }: ActivityChartProps) => {
  const maxTokens = useMemo(
    () => Math.max(...groups.map((g) => g.totalTokens), 1),
    [groups]
  );

  // Show oldest → newest (left → right)
  const displayGroups = useMemo(
    () => groups.slice().reverse(),
    [groups]
  );

  const formatBarLabel = useCallback(
    (key: string): string => {
      if (groupBy === "day") {
        return String(new Date(`${key  }T12:00:00`).getDate());
      }
      const d = new Date(`${key  }T12:00:00`);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    },
    [groupBy]
  );

  if (displayGroups.length < 2) return null;

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Activity Overview
        </p>
        <div className="mt-3 flex items-end gap-[3px]" style={{ height: 72 }}>
          {displayGroups.map((g) => {
            const pct = (g.totalTokens / maxTokens) * 100;
            const inputPct = g.totalTokens > 0 ? (g.totalInputTokens / g.totalTokens) * 100 : 50;
            return (
              <div
                key={g.key}
                className="group relative flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="flex w-full flex-col justify-end"
                  style={{ height: 56 }}
                >
                  {/* Stacked bar: input (bottom, blue) + output (top, indigo) */}
                  <div
                    className="relative w-full overflow-hidden rounded-t-sm transition-[height,filter] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:brightness-125"
                    style={{ height: `${Math.max(pct, 4)}%`, minHeight: 2 }}
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-blue-500/50"
                      style={{ height: `${inputPct}%` }}
                    />
                    <div
                      className="absolute top-0 left-0 right-0 bg-indigo-400/40"
                      style={{ height: `${100 - inputPct}%` }}
                    />
                  </div>
                </div>
                <span className="text-[8px] tabular-nums text-zinc-500">
                  {formatBarLabel(g.key)}
                </span>

                {/* Hover tooltip */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 opacity-0 shadow-xl ring-1 ring-[var(--border-hairline)] transition-opacity duration-200 group-hover:opacity-100">
                  <p className="whitespace-nowrap text-[10px] font-semibold text-zinc-200">
                    {g.label}
                  </p>
                  <p className="mt-0.5 whitespace-nowrap text-[10px] text-zinc-400">
                    {g.sessionCount} session{g.sessionCount !== 1 ? "s" : ""}{" "}
                    &middot; {formatTokens(g.totalTokens)} tokens &middot;{" "}
                    {formatDuration(g.totalDurationMinutes)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[9px] text-zinc-500">
            <span className="inline-block h-2 w-2 rounded-sm bg-blue-500/50" />
            Input
          </span>
          <span className="flex items-center gap-1.5 text-[9px] text-zinc-500">
            <span className="inline-block h-2 w-2 rounded-sm bg-indigo-400/40" />
            Output
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Sortable table header ────────────────────────────────

type SortableHeaderProps = {
  label: string;
  field: SortField;
  activeSort: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  align?: "text-left" | "text-right";
};

const SortableHeader = ({
  label,
  field,
  activeSort,
  direction,
  onSort,
  align = "text-left",
}: SortableHeaderProps) => {
  const isActive = activeSort === field;
  const arrow = isActive ? (direction === "asc" ? "\u25B2" : "\u25BC") : "";

  const handleClick = useCallback(() => {
    onSort(field);
  }, [onSort, field]);

  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 text-xs font-medium transition-colors duration-200 hover:text-zinc-300 ${align} ${
        isActive ? "text-zinc-300" : "text-zinc-500"
      }`}
      onClick={handleClick}
    >
      {label}
      {arrow && (
        <span className="ml-1 text-[9px] text-blue-400">{arrow}</span>
      )}
    </th>
  );
};

// ─── Group header row ─────────────────────────────────────

type GroupHeaderProps = {
  group: SessionGroup;
  maxGroupTokens: number;
};

const GroupHeader = ({ group, maxGroupTokens }: GroupHeaderProps) => {
  const barWidth = maxGroupTokens > 0 ? (group.totalTokens / maxGroupTokens) * 100 : 0;

  return (
    <tr>
      <td colSpan={8} className="px-3 pt-5 pb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-200">
            {group.label}
          </span>
          <span className="text-[10px] text-zinc-500">
            {group.sessionCount} session{group.sessionCount !== 1 ? "s" : ""}{" "}
            &middot; {formatTokens(group.totalTokens)} tokens &middot;{" "}
            {formatDuration(group.totalDurationMinutes)}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--overlay-faint)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500/40 to-indigo-400/30 transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      </td>
    </tr>
  );
};

// ─── Session row ──────────────────────────────────────────

type SessionRowProps = {
  session: SessionMeta;
  isExpanded: boolean;
  onToggle: () => void;
  projectPath: string;
};

const SessionRow = ({
  session,
  isExpanded,
  onToggle,
  projectPath,
}: SessionRowProps) => {
  const totalMessages = session.userMessages + session.assistantMessages;

  const handleClose = useCallback(() => {
    onToggle();
  }, [onToggle]);

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-[var(--border-hairline)] transition-[background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--overlay-faint)] ${
          isExpanded ? "bg-[var(--overlay-subtle)]" : ""
        }`}
        onClick={onToggle}
        title="Click to analyze"
      >
        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-400">
          {formatRelativeDate(session.startTime)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-400">
          {formatDuration(session.durationMinutes)}
        </td>
        <td
          className="max-w-[240px] truncate px-3 py-2.5 text-sm text-zinc-300"
          title={session.firstPrompt}
        >
          {session.sessionName && (
            <span className="mr-1.5 text-[10px] font-medium text-zinc-500">
              {session.sessionName}
            </span>
          )}
          {truncatePrompt(session.firstPrompt)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-400">
          {totalMessages}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-400">
          <span className="text-zinc-500">in:</span>
          {formatTokens(session.inputTokens)}{" "}
          <span className="text-zinc-500">out:</span>
          {formatTokens(session.outputTokens)}
        </td>
        <td className="px-3 py-2.5">
          <ToolBadgeList toolCounts={session.toolCounts} />
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums">
          {session.linesAdded > 0 && (
            <span className="text-green-400">+{session.linesAdded}</span>
          )}
          {session.linesAdded > 0 && session.linesRemoved > 0 && (
            <span className="text-zinc-500">/</span>
          )}
          {session.linesRemoved > 0 && (
            <span className="text-red-400">-{session.linesRemoved}</span>
          )}
          {session.linesAdded === 0 && session.linesRemoved === 0 && (
            <span className="text-zinc-500">-</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums">
          {session.toolErrors > 0 ? (
            <span className="text-red-400">{session.toolErrors}</span>
          ) : (
            <span className="text-zinc-500">0</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <SessionDeepDive
          sessionId={session.sessionId}
          projectPath={projectPath}
          onClose={handleClose}
        />
      )}
    </>
  );
};

// ─── Summary bar ──────────────────────────────────────────

type SummaryBarProps = {
  totalSessions: number;
  filteredSessions: number;
  totalTokens: number;
  totalCommits: number;
};

const SummaryBar = ({
  totalSessions,
  filteredSessions,
  totalTokens,
  totalCommits,
}: SummaryBarProps) => {
  const isFiltered = filteredSessions < totalSessions;

  return (
    <div className="flex items-center gap-4 text-xs tabular-nums text-zinc-400">
      <span>
        <span className="font-medium text-zinc-200">{filteredSessions}</span>
        {isFiltered && (
          <span className="text-zinc-500"> of {totalSessions}</span>
        )}{" "}
        sessions
      </span>
      <span className="text-zinc-500">|</span>
      <span>
        <span className="font-medium text-zinc-200">
          {formatTokens(totalTokens)}
        </span>{" "}
        tokens
      </span>
      <span className="text-zinc-500">|</span>
      <span>
        <span className="font-medium text-zinc-200">{totalCommits}</span>{" "}
        commits
      </span>
    </div>
  );
};

// ─── Table header ─────────────────────────────────────────

type TableHeaderProps = {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
};

const TableHeader = ({ sortField, sortDirection, onSort }: TableHeaderProps) => (
  <thead>
    <tr className="border-b border-[var(--border-accent)]">
      <SortableHeader
        label="Date"
        field="date"
        activeSort={sortField}
        direction={sortDirection}
        onSort={onSort}
      />
      <SortableHeader
        label="Duration"
        field="duration"
        activeSort={sortField}
        direction={sortDirection}
        onSort={onSort}
        align="text-right"
      />
      <th className="px-3 py-2 text-xs font-medium text-zinc-500">Prompt</th>
      <SortableHeader
        label="Msgs"
        field="messages"
        activeSort={sortField}
        direction={sortDirection}
        onSort={onSort}
        align="text-right"
      />
      <SortableHeader
        label="Tokens"
        field="tokens"
        activeSort={sortField}
        direction={sortDirection}
        onSort={onSort}
        align="text-right"
      />
      <th className="px-3 py-2 text-xs font-medium text-zinc-500">Tools</th>
      <SortableHeader
        label="Lines"
        field="lines"
        activeSort={sortField}
        direction={sortDirection}
        onSort={onSort}
        align="text-right"
      />
      <SortableHeader
        label="Errors"
        field="errors"
        activeSort={sortField}
        direction={sortDirection}
        onSort={onSort}
        align="text-right"
      />
    </tr>
  </thead>
);

// ─── Main component ───────────────────────────────────────

export const SessionHistory = ({
  projectPath,
  focusSessionId,
}: SessionHistoryProps) => {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null
  );

  // Filter / sort / group state
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const loadSessions = useCallback(async () => {
    try {
      const url = buildScopedUrl("/api/sessions", projectPath);
      const res = await fetch(url);
      if (!res.ok) return;
      const data: SessionsResponse = await res.json();
      setSessions(data.sessions);
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    setIsLoading(true);
    setExpandedSessionId(null);
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (focusSessionId) {
      setExpandedSessionId(focusSessionId);
    }
  }, [focusSessionId]);

  // ── Derived data ──

  const filteredSorted = useMemo(() => {
    let result = sessions;

    // Date range filter
    if (dateRange !== "all") {
      result = result.filter((s) => isWithinDateRange(s.startTime, dateRange));
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.firstPrompt.toLowerCase().includes(q)
      );
    }

    // Sort
    result = result.slice().sort((a, b) => compareSessions(a, b, sortField, sortDirection));

    return result;
  }, [sessions, dateRange, searchQuery, sortField, sortDirection]);

  const groups = useMemo(
    () => groupSessions(filteredSorted, groupBy),
    [filteredSorted, groupBy]
  );

  const maxGroupTokens = useMemo(
    () => Math.max(...groups.map((g) => g.totalTokens), 1),
    [groups]
  );

  const filteredTokens = useMemo(
    () => filteredSorted.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0),
    [filteredSorted]
  );

  const filteredCommits = useMemo(
    () => filteredSorted.reduce((sum, s) => sum + s.gitCommits, 0),
    [filteredSorted]
  );

  // ── Handlers ──

  const handleToggle = useCallback((sessionId: string) => {
    setExpandedSessionId((prev) => (prev === sessionId ? null : sessionId));
  }, []);

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("desc");
      }
    },
    [sortField]
  );

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  const handleDateRangeChange = useCallback((r: DateRange) => {
    setDateRange(r);
  }, []);

  const handleGroupByChange = useCallback((g: GroupBy) => {
    setGroupBy(g);
  }, []);

  // ── Render ──

  if (isLoading) return null;

  if (sessions.length === 0) {
    return (
      <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold text-zinc-100">
          Session History
        </h3>
        <p className="mt-2 text-xs text-zinc-500">
          No sessions found for this project.
        </p>
      </CardContent>
      </Card>
    );
  }

  return (
    <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">
          Session History
        </h3>
        <SummaryBar
          totalSessions={sessions.length}
          filteredSessions={filteredSorted.length}
          totalTokens={filteredTokens}
          totalCommits={filteredCommits}
        />
      </div>

      <div className="mt-3">
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          groupBy={groupBy}
          onGroupByChange={handleGroupByChange}
        />
      </div>

      {/* Activity chart — visible when grouped and enough data */}
      {groupBy !== "none" && groups.length >= 2 && (
        <div className="mt-4">
          <ActivityChart groups={groups} groupBy={groupBy} />
        </div>
      )}

      {/* Empty filtered state */}
      {filteredSorted.length === 0 && (
        <p className="mt-6 text-center text-xs text-zinc-500">
          No sessions match your filters.
        </p>
      )}

      {/* Table */}
      {filteredSorted.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <TableHeader
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <tbody>
              {groupBy === "none"
                ? filteredSorted.map((session) => (
                    <SessionRow
                      key={session.sessionId}
                      session={session}
                      isExpanded={expandedSessionId === session.sessionId}
                      onToggle={() => handleToggle(session.sessionId)}
                      projectPath={projectPath}
                    />
                  ))
                : groups.map((group) => (
                    <GroupedRows
                      key={group.key}
                      group={group}
                      maxGroupTokens={maxGroupTokens}
                      expandedSessionId={expandedSessionId}
                      onToggle={handleToggle}
                      projectPath={projectPath}
                    />
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </CardContent>
    </Card>
  );
};

// ─── Grouped rows (extracted to avoid inline map) ─────────

type GroupedRowsProps = {
  group: SessionGroup;
  maxGroupTokens: number;
  expandedSessionId: string | null;
  onToggle: (sessionId: string) => void;
  projectPath: string;
};

const GroupedRows = ({
  group,
  maxGroupTokens,
  expandedSessionId,
  onToggle,
  projectPath,
}: GroupedRowsProps) => (
  <>
    <GroupHeader group={group} maxGroupTokens={maxGroupTokens} />
    {group.sessions.map((session) => (
      <SessionRow
        key={session.sessionId}
        session={session}
        isExpanded={expandedSessionId === session.sessionId}
        onToggle={() => onToggle(session.sessionId)}
        projectPath={projectPath}
      />
    ))}
  </>
);
