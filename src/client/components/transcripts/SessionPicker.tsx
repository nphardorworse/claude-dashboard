import { useMemo, useState } from "react";
import type { SessionMeta } from "../../../shared/types";
import { Input } from "~/client/components/ui/input";

const formatRelative = (iso: string): string => {
  const d = new Date(iso).getTime();
  if (!d) return "";
  const diffMs = Date.now() - d;
  const m = Math.floor(diffMs / 60_000);
  const h = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const truncate = (text: string, max = 48): string => {
  if (!text) return "(untitled)";
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
};

type SessionPickerProps = {
  sessions: SessionMeta[];
  selectedSessionId: string | null;
  onSelect: (session: SessionMeta) => void;
};

export const SessionPicker = ({
  sessions,
  selectedSessionId,
  onSelect,
}: SessionPickerProps) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter(
      (s) =>
        s.firstPrompt.toLowerCase().includes(q) ||
        s.sessionName.toLowerCase().includes(q) ||
        s.sessionId.toLowerCase().includes(q),
    );
  }, [sessions, query]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--border-hairline)] p-3">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter sessions…"
        className="text-xs"
      />

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-zinc-500">
            No sessions match.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((session) => {
              const isActive = session.sessionId === selectedSessionId;
              return (
                <li key={session.sessionId}>
                  <button
                    type="button"
                    onClick={() => onSelect(session)}
                    className={`w-full rounded-md px-2.5 py-2 text-left transition-snappy ${
                      isActive
                        ? "bg-blue-500/10 ring-1 ring-blue-500/30"
                        : "hover:bg-[var(--overlay-subtle)]"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`truncate text-xs ${
                          isActive ? "text-zinc-100" : "text-zinc-300"
                        }`}
                      >
                        {session.sessionName || truncate(session.firstPrompt)}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {formatRelative(session.startTime)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500 tabular-nums">
                      <span>{session.userMessages} msgs</span>
                      <span className="text-zinc-600">·</span>
                      <span className="font-mono truncate">{session.sessionId.slice(0, 8)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
