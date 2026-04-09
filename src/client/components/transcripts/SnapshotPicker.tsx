import { useMemo, useState } from "react";
import type { SnapshotMeta } from "../../../shared/types";
import { Input } from "~/client/components/ui/input";

const formatRelative = (ms: number): string => {
  if (!ms) return "";
  const diffMs = Date.now() - ms;
  const m = Math.floor(diffMs / 60_000);
  const h = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const truncate = (text: string, max = 48): string => {
  if (!text) return "(no note)";
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
};

type SnapshotPickerProps = {
  snapshots: SnapshotMeta[];
  selectedSnapshotId: string | null;
  onSelect: (snapshot: SnapshotMeta) => void;
  onDelete: (snapshot: SnapshotMeta) => void;
  isLoading: boolean;
  error: string | null;
};

export const SnapshotPicker = ({
  snapshots,
  selectedSnapshotId,
  onSelect,
  onDelete,
  isLoading,
  error,
}: SnapshotPickerProps) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    // Already sorted newest first from server
    if (!query.trim()) return snapshots;
    const q = query.toLowerCase();
    return snapshots.filter(
      (s) =>
        s.note.toLowerCase().includes(q) ||
        s.sessionId.toLowerCase().includes(q) ||
        s.sessionName.toLowerCase().includes(q) ||
        s.projectPath.toLowerCase().includes(q),
    );
  }, [snapshots, query]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--border-hairline)] p-3">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter snapshots…"
        className="text-xs"
      />

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-2 py-4 text-center text-[11px] text-zinc-500">
            Loading snapshots…
          </p>
        ) : error ? (
          <p className="px-2 py-4 text-center text-[11px] text-red-400">
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-zinc-500">
            {snapshots.length === 0 ? "No snapshots saved yet." : "No snapshots match."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((snapshot) => {
              const isActive = snapshot.id === selectedSnapshotId;
              const createdMs = new Date(snapshot.createdAt).getTime();
              return (
                <li key={snapshot.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(snapshot)}
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
                        {snapshot.sessionName || truncate(snapshot.note)}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {formatRelative(createdMs)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500 tabular-nums">
                      <span>{snapshot.userMessageCount}/{snapshot.assistantMessageCount} msgs</span>
                      <span className="text-zinc-600">·</span>
                      <span>{formatBytes(snapshot.sizeBytes)}</span>
                      {snapshot.conversationOnly && (
                        <>
                          <span className="text-zinc-600">·</span>
                          <span className="text-amber-400/80">conv</span>
                        </>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="font-mono truncate">{snapshot.sessionId.slice(0, 8)}</span>
                      {snapshot.note && snapshot.sessionName && (
                        <>
                          <span className="text-zinc-600">·</span>
                          <span className="truncate">{truncate(snapshot.note, 24)}</span>
                        </>
                      )}
                    </div>
                  </button>
                  {isActive && (
                    <div className="flex justify-end px-2 pb-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const ok = window.confirm(
                            `Delete this snapshot?`,
                          );
                          if (ok) onDelete(snapshot);
                        }}
                        className="text-[10px] text-red-400/60 hover:text-red-300 transition-snappy"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
