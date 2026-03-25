import { useCallback } from "react";
import type { McpOrigin, McpCatalogEntry } from "../../../shared/types";

type McpCatalogCardProps = {
  name: string;
  origin: McpOrigin;
  pluginName?: string;
  pluginNames?: string[];
  health: McpCatalogEntry["health"];
  type: string;
  command: string;
  isPinned: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  onPin?: (name: string) => void;
  onDelete?: (name: string) => void;
};

type HealthStatus = McpCatalogEntry["health"];

const STATUS_DOT_CLASSES: Record<HealthStatus, string> = {
  connected: "bg-emerald-400 shadow-[0_0_6px_var(--glow-emerald)]",
  needs_auth: "bg-amber-400 shadow-[0_0_6px_var(--glow-amber)]",
  failed: "bg-red-400 shadow-[0_0_6px_var(--glow-red)]",
  unknown: "bg-zinc-600",
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  connected: "Connected",
  needs_auth: "Needs auth",
  failed: "Failed",
  unknown: "Unknown",
};

const ORIGIN_BADGE_CLASSES: Record<McpOrigin, string> = {
  global: "bg-blue-500/10 text-blue-400/80 ring-blue-500/20",
  "global-disabled": "bg-red-500/10 text-red-400/80 ring-red-500/20",
  plugin: "bg-purple-500/10 text-purple-400/80 ring-purple-500/20",
  project: "bg-emerald-500/10 text-emerald-400/80 ring-emerald-500/20",
  personal: "bg-zinc-500/10 text-zinc-400/80 ring-zinc-500/20",
  cloud: "bg-orange-500/10 text-orange-400/80 ring-orange-500/20",
};

const StatusDot = ({ health }: { health: HealthStatus }) => {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[health]}`}
      />
      <span className="text-[11px] text-zinc-500">{STATUS_LABELS[health]}</span>
    </div>
  );
};

const OriginBadge = ({
  origin,
  pluginName,
  pluginNames,
}: {
  origin: McpOrigin;
  pluginName?: string;
  pluginNames?: string[];
}) => {
  const resolvedPluginLabel =
    pluginNames && pluginNames.length > 1
      ? pluginNames.join(", ")
      : pluginName;
  const label =
    origin === "plugin" && resolvedPluginLabel
      ? resolvedPluginLabel
      : origin.replace("-", " ");

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${ORIGIN_BADGE_CLASSES[origin]}`}
    >
      {label}
    </span>
  );
};

const PinToggle = ({
  name,
  isPinned,
  onPin,
}: {
  name: string;
  isPinned: boolean;
  onPin: (name: string) => void;
}) => {
  const handleClick = useCallback(() => {
    onPin(name);
  }, [name, onPin]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isPinned ? "Unpin" : "Pin"}
      className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 transition-snappy hover:bg-[var(--overlay-subtle)] hover:text-zinc-300 active:scale-[0.96]"
    >
      {isPinned ? "📌" : "○"}
    </button>
  );
};

const ActionButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-zinc-300 ring-1 ring-[var(--border-hairline)] transition-snappy hover:bg-[var(--overlay-subtle)] hover:ring-[var(--border-accent)] active:scale-[0.96]"
    >
      {label}
    </button>
  );
};

const DeleteButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-snappy hover:bg-red-500/10 hover:text-red-400 active:scale-[0.96]"
    >
      Delete
    </button>
  );
};

const CommandDisplay = ({ command }: { command: string }) => {
  return (
    <p className="mt-1 truncate font-mono text-xs text-zinc-500" title={command}>
      {command}
    </p>
  );
};

const McpCatalogCard = ({
  name,
  origin,
  pluginName,
  pluginNames,
  health,
  type,
  command,
  isPinned,
  action,
  onPin,
  onDelete,
}: McpCatalogCardProps) => {
  const handleDelete = useCallback(() => {
    const confirmed = window.confirm(
      `Delete MCP server "${name}"? This action cannot be undone.`
    );
    if (confirmed && onDelete) {
      onDelete(name);
    }
  }, [name, onDelete]);

  return (
    <div className="group rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)] transition-snappy hover:ring-[var(--border-accent)]">
      <div className="flex items-center justify-between gap-4 rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-4 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="truncate text-[13px] font-semibold text-zinc-100">
              {name}
            </h3>
            <span className="rounded-full bg-[var(--overlay-subtle)] px-2 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-[var(--border-hairline)]">
              {type}
            </span>
            <OriginBadge origin={origin} pluginName={pluginName} pluginNames={pluginNames} />
            <StatusDot health={health} />
          </div>
          <CommandDisplay command={command} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onPin !== undefined && (
            <PinToggle name={name} isPinned={isPinned} onPin={onPin} />
          )}
          {action !== undefined && (
            <ActionButton label={action.label} onClick={action.onClick} />
          )}
          {onDelete !== undefined && <DeleteButton onClick={handleDelete} />}
        </div>
      </div>
    </div>
  );
};

export { McpCatalogCard };
