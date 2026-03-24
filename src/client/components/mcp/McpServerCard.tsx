import { useCallback } from "react";

type McpServerStatus = "connected" | "needs_auth" | "failed" | "unknown";

type McpServerSource = "global" | "project-file" | "project-settings";

type McpServerCardProps = {
  name: string;
  command: string;
  args: string[];
  type: string;
  status: McpServerStatus;
  source?: McpServerSource;
  onDelete: (name: string) => void;
};

const STATUS_DOT_CLASSES: Record<McpServerStatus, string> = {
  connected: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]",
  needs_auth: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]",
  failed: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.4)]",
  unknown: "bg-zinc-600",
};

const STATUS_LABELS: Record<McpServerStatus, string> = {
  connected: "Connected",
  needs_auth: "Needs auth",
  failed: "Failed",
  unknown: "Unknown",
};

const StatusDot = ({ status }: { status: McpServerStatus }) => {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[status]}`}
      />
      <span className="text-[11px] text-zinc-500">{STATUS_LABELS[status]}</span>
    </div>
  );
};

const CommandDisplay = ({
  command,
  args,
}: {
  command: string;
  args: string[];
}) => {
  const fullCommand =
    args.length > 0 ? `${command} ${args.join(" ")}` : command;

  return (
    <p
      className="mt-1 truncate font-mono text-xs text-zinc-500"
      title={fullCommand}
    >
      {fullCommand}
    </p>
  );
};

const DeleteButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-snappy hover:bg-red-500/10 hover:text-red-400 active:scale-95"
    >
      Delete
    </button>
  );
};

const SOURCE_LABELS: Record<McpServerSource, string> = {
  "global": "~/.claude.json",
  "project-file": ".mcp.json",
  "project-settings": "~/.claude.json (project)",
};

export const McpServerCard = ({
  name,
  command,
  args,
  type,
  status,
  source,
  onDelete,
}: McpServerCardProps) => {
  const handleDelete = useCallback(() => {
    const confirmed = window.confirm(
      `Delete MCP server "${name}"? This will remove it from ~/.claude.json.`
    );
    if (confirmed) {
      onDelete(name);
    }
  }, [name, onDelete]);

  return (
    <div className="group rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)] transition-snappy hover:ring-[var(--border-accent)]">
      <div className="flex items-center justify-between gap-4 rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-4 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate text-[13px] font-semibold text-zinc-100">
              {name}
            </h3>
            <span className="rounded-full bg-[var(--overlay-subtle)] px-2 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-[var(--border-hairline)]">
              {type}
            </span>
            <StatusDot status={status} />
            {source && (
              <span className="rounded-full bg-[var(--overlay-faint)] px-2 py-0.5 text-[10px] text-zinc-600">
                {SOURCE_LABELS[source]}
              </span>
            )}
          </div>
          <CommandDisplay command={command} args={args} />
        </div>
        <div className="shrink-0">
          <DeleteButton onClick={handleDelete} />
        </div>
      </div>
    </div>
  );
};
