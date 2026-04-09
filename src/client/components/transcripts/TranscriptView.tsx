import { useCallback, useMemo, useState } from "react";
import type { TranscriptEntry, TranscriptResponse } from "../../../shared/types";
import { Card, CardContent } from "~/client/components/ui/card";

export type TranscriptFilter = "all" | "conversation" | "user" | "assistant";
export type TranscriptOrder = "asc" | "desc";

const formatTimestamp = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const roleStyles: Record<string, { label: string; className: string; bar: string }> = {
  user: {
    label: "User",
    className: "text-blue-300",
    bar: "bg-blue-400/70",
  },
  assistant: {
    label: "Assistant",
    className: "text-zinc-200",
    bar: "bg-indigo-400/70",
  },
  "assistant-internal": {
    label: "Assistant (tool call)",
    className: "text-zinc-400",
    bar: "bg-zinc-500/50",
  },
  summary: {
    label: "Compact summary",
    className: "text-amber-300",
    bar: "bg-amber-400/70",
  },
  system: {
    label: "System",
    className: "text-zinc-400",
    bar: "bg-zinc-500/70",
  },
};

const formatToolInput = (input: unknown): string => {
  if (input == null) return "";
  try {
    const text = JSON.stringify(input, null, 2);
    if (text.length > 600) return `${text.slice(0, 600)}…`;
    return text;
  } catch {
    return String(input);
  }
};

/** Is this entry "user-facing"? i.e. has actual text content for the user */
const isUserFacing = (entry: TranscriptEntry): boolean => {
  if (entry.role === "user") return true;
  if (entry.role === "summary") return true;
  if (entry.role === "assistant") return entry.text.trim().length > 0;
  return false;
};

/** Is this an internal-only assistant message (tool calls without text)? */
const isInternalOnly = (entry: TranscriptEntry): boolean => {
  return (
    entry.role === "assistant" &&
    entry.text.trim().length === 0 &&
    entry.toolUses.length > 0
  );
};

const applyFilter = (
  entries: TranscriptEntry[],
  filter: TranscriptFilter,
): TranscriptEntry[] => {
  switch (filter) {
    case "all":
      return entries;
    case "conversation":
      return entries.filter((e) => isUserFacing(e));
    case "user":
      return entries.filter((e) => e.role === "user");
    case "assistant":
      return entries.filter(
        (e) => e.role === "assistant" || e.role === "summary",
      );
  }
};

// ─── Filter / order controls ─────────────────────────────

type FilterOption = { value: TranscriptFilter; label: string };
const FILTER_OPTIONS: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "conversation", label: "Conversation" },
  { value: "user", label: "User only" },
  { value: "assistant", label: "Assistant only" },
];

type ControlBarProps = {
  filter: TranscriptFilter;
  onFilterChange: (f: TranscriptFilter) => void;
  order: TranscriptOrder;
  onOrderChange: (o: TranscriptOrder) => void;
  visibleCount: number;
  totalCount: number;
};

const ControlBar = ({
  filter,
  onFilterChange,
  order,
  onOrderChange,
  visibleCount,
  totalCount,
}: ControlBarProps) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="flex rounded-lg ring-1 ring-[var(--border-hairline)] bg-[var(--overlay-faint)]">
      {FILTER_OPTIONS.map((opt, idx) => {
        const isActive = filter === opt.value;
        const isFirst = idx === 0;
        const isLast = idx === FILTER_OPTIONS.length - 1;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onFilterChange(opt.value)}
            className={`px-2.5 py-1.5 text-[11px] font-medium transition-snappy active:scale-[0.96] ${
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

    <button
      type="button"
      onClick={() => onOrderChange(order === "asc" ? "desc" : "asc")}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 ring-1 ring-[var(--border-hairline)] bg-[var(--overlay-faint)] transition-snappy hover:text-zinc-300 active:scale-[0.96]"
    >
      {order === "asc" ? "Oldest first" : "Newest first"}
      <span className="text-[9px] text-blue-400">
        {order === "asc" ? "\u25B2" : "\u25BC"}
      </span>
    </button>

    {visibleCount !== totalCount && (
      <span className="text-[10px] text-zinc-500">
        Showing {visibleCount} of {totalCount}
      </span>
    )}
  </div>
);

// ─── Entry block ─────────────────────────────────────────

type EntryBlockProps = {
  entry: TranscriptEntry;
  hideToolDetails: boolean;
};

const EntryBlock = ({ entry, hideToolDetails }: EntryBlockProps) => {
  const isInternal = isInternalOnly(entry);
  const styleKey = isInternal ? "assistant-internal" : entry.role;
  const style = roleStyles[styleKey] ?? roleStyles.system;

  return (
    <div className="relative border-l-2 pl-4 py-2" style={{ borderColor: "transparent" }}>
      <span
        className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full ${style.bar}`}
      />
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${style.className}`}>
          {style.label}
        </span>
        {entry.model && (
          <span className="text-[10px] text-zinc-500">{entry.model}</span>
        )}
        {entry.timestamp && (
          <span className="text-[10px] text-zinc-500">
            {formatTimestamp(entry.timestamp)}
          </span>
        )}
      </div>

      {entry.text && (
        <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-zinc-200">
          {entry.text}
        </pre>
      )}

      {!hideToolDetails && entry.toolUses.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {entry.toolUses.map((use, i) => (
            <div
              key={i}
              className="rounded-md bg-[var(--overlay-faint)] px-3 py-2 ring-1 ring-[var(--border-hairline)]"
            >
              <span className="text-[10px] font-mono text-zinc-400">
                tool: <span className="text-blue-300">{use.name}</span>
              </span>
              {use.input !== undefined && (
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-zinc-400">
                  {formatToolInput(use.input)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {hideToolDetails && entry.toolUses.length > 0 && (
        <p className="mt-1 text-[10px] text-zinc-500">
          {entry.toolUses.length} tool call{entry.toolUses.length > 1 ? "s" : ""}:{" "}
          {entry.toolUses.map((u) => u.name).join(", ")}
        </p>
      )}

      {!hideToolDetails && entry.toolResults.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {entry.toolResults.map((result, i) => (
            <div
              key={i}
              className={`rounded-md px-3 py-1.5 font-mono text-[11px] ${
                result.isError
                  ? "bg-red-500/5 text-red-300 ring-1 ring-red-500/20"
                  : "bg-[var(--overlay-subtle)] text-zinc-400"
              }`}
            >
              <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                {result.isError ? "tool error" : "tool result"}
              </span>
              <pre className="mt-0.5 whitespace-pre-wrap break-words">
                {result.text || "(empty)"}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main component ──────────────────────────────────────

type TranscriptViewProps = {
  transcript: TranscriptResponse;
  /** Currently active filter — lifted to parent so snapshots can capture it */
  filter?: TranscriptFilter;
  onFilterChange?: (f: TranscriptFilter) => void;
  order?: TranscriptOrder;
  onOrderChange?: (o: TranscriptOrder) => void;
};

export const TranscriptView = ({
  transcript,
  filter: filterProp,
  onFilterChange: onFilterChangeProp,
  order: orderProp,
  onOrderChange: onOrderChangeProp,
}: TranscriptViewProps) => {
  // Local fallbacks if parent doesn't control filter/order
  const [localFilter, setLocalFilter] = useState<TranscriptFilter>("all");
  const [localOrder, setLocalOrder] = useState<TranscriptOrder>("asc");

  const filter = filterProp ?? localFilter;
  const order = orderProp ?? localOrder;
  const handleFilterChange = useCallback(
    (f: TranscriptFilter) => {
      if (onFilterChangeProp) onFilterChangeProp(f);
      else setLocalFilter(f);
    },
    [onFilterChangeProp],
  );
  const handleOrderChange = useCallback(
    (o: TranscriptOrder) => {
      if (onOrderChangeProp) onOrderChangeProp(o);
      else setLocalOrder(o);
    },
    [onOrderChangeProp],
  );

  const hideToolDetails = filter === "conversation";

  const visibleEntries = useMemo(() => {
    const filtered = applyFilter(transcript.entries, filter);
    return order === "desc" ? [...filtered].reverse() : filtered;
  }, [transcript.entries, filter, order]);

  const stats = useMemo(
    () => ({
      total: transcript.entries.length,
      users: transcript.totalUserMessages,
      assistants: transcript.totalAssistantMessages,
      size: formatBytes(transcript.rawBytes),
    }),
    [transcript],
  );

  if (transcript.entries.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-zinc-500">This transcript is empty.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
          <span>
            <span className="font-semibold text-zinc-200">{stats.total}</span>{" "}
            entries
          </span>
          <span className="text-zinc-600">|</span>
          <span>
            <span className="font-semibold text-zinc-200">{stats.users}</span>{" "}
            user
          </span>
          <span>
            <span className="font-semibold text-zinc-200">{stats.assistants}</span>{" "}
            assistant
          </span>
          <span className="text-zinc-600">|</span>
          <span>{stats.size}</span>
        </div>

        <ControlBar
          filter={filter}
          onFilterChange={handleFilterChange}
          order={order}
          onOrderChange={handleOrderChange}
          visibleCount={visibleEntries.length}
          totalCount={transcript.entries.length}
        />

        <div className="mt-4 flex flex-col gap-3">
          {visibleEntries.map((entry) => (
            <EntryBlock
              key={entry.index}
              entry={entry}
              hideToolDetails={hideToolDetails}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
