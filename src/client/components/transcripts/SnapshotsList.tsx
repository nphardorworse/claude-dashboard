import { useCallback } from "react";
import type { SnapshotMeta } from "../../../shared/types";
import { Button } from "~/client/components/ui/button";
import { Card, CardContent } from "~/client/components/ui/card";

const formatDateTime = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

type SnapshotsListProps = {
  snapshots: SnapshotMeta[];
  selectedSnapshotId: string | null;
  onSelect: (snapshot: SnapshotMeta) => void;
  onDelete: (snapshot: SnapshotMeta) => void;
  isLoading: boolean;
  error: string | null;
};

export const SnapshotsList = ({
  snapshots,
  selectedSnapshotId,
  onSelect,
  onDelete,
  isLoading,
  error,
}: SnapshotsListProps) => {
  const handleDelete = useCallback(
    (snapshot: SnapshotMeta) => {
      const ok = window.confirm(
        `Delete snapshot from ${formatDateTime(snapshot.createdAt)}?`,
      );
      if (!ok) return;
      onDelete(snapshot);
    },
    [onDelete],
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-zinc-500">Loading snapshots…</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
        <p className="text-sm text-red-400">Failed to load snapshots: {error}</p>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-zinc-500">
            No snapshots saved yet. Open a session and click "Save Snapshot" to
            archive its full transcript — it will be preserved even if the
            session is later compacted.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {snapshots.map((snapshot) => {
        const isActive = snapshot.id === selectedSnapshotId;
        return (
          <div
            key={snapshot.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 ring-1 transition-snappy ${
              isActive
                ? "bg-blue-500/10 ring-blue-500/30"
                : "bg-[var(--surface-raised)] ring-[var(--border-hairline)] hover:bg-[var(--overlay-subtle)]"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(snapshot)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-zinc-100">
                  {formatDateTime(snapshot.createdAt)}
                </span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {snapshot.sessionId.slice(0, 8)}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {snapshot.entryCount} entries · {snapshot.userMessageCount}/
                  {snapshot.assistantMessageCount} msgs · {formatBytes(snapshot.sizeBytes)}
                </span>
              </div>
              {snapshot.note && (
                <p className="mt-1 text-xs text-zinc-400">{snapshot.note}</p>
              )}
              <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
                {snapshot.projectPath}
              </p>
            </button>

            <Button
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(snapshot);
              }}
              className="shrink-0 text-red-400 hover:text-red-300"
            >
              Delete
            </Button>
          </div>
        );
      })}
    </div>
  );
};
