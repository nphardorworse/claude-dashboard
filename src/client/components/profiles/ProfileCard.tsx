import { useCallback, useState } from "react";
import type { HooksMap, ProfileEntry } from "../../../shared/types";

type ProfileCardProps = {
  name: string;
  description: string;
  pluginCount: number;
  skillCount: number;
  hookEventCount: number;
  mcpServerCount: number;
  plugins: Record<string, boolean>;
  skills: Record<string, boolean>;
  hooks: HooksMap;
  enabledMcpServers: string[];
  disabledMcpServers: string[];
  isActive: boolean;
  isSwitching: boolean;
  onActivate: (name: string) => void;
  onEdit: (profile: ProfileEntry) => void;
  onDelete: (name: string) => Promise<void>;
};

const ActiveBadge = () => (
  <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-medium text-blue-400">
    Active
  </span>
);

const SuiteBadges = ({
  pluginCount,
  skillCount,
  hookEventCount,
  mcpServerCount,
}: {
  pluginCount: number;
  skillCount: number;
  hookEventCount: number;
  mcpServerCount: number;
}) => (
  <div className="flex flex-wrap gap-1.5">
    <span className="rounded-full bg-[var(--overlay-medium)] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
      {pluginCount} plugins
    </span>
    {skillCount > 0 && (
      <span className="rounded-full bg-[var(--overlay-medium)] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
        {skillCount} skills
      </span>
    )}
    {hookEventCount > 0 && (
      <span className="rounded-full bg-[var(--overlay-medium)] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
        {hookEventCount} hooks
      </span>
    )}
    {mcpServerCount > 0 && (
      <span className="rounded-full bg-[var(--overlay-medium)] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
        {mcpServerCount} MCP
      </span>
    )}
  </div>
);

const ActivateButton = ({
  isActive,
  isSwitching,
  onClick,
}: {
  isActive: boolean;
  isSwitching: boolean;
  onClick: () => void;
}) => {
  if (isActive) {
    return (
      <button
        disabled
        className="flex-1 cursor-default rounded-lg bg-blue-500/10 py-2 text-sm font-medium text-blue-400"
      >
        Active
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={isSwitching}
      className="flex-1 rounded-lg bg-[var(--overlay-medium)] py-2 text-sm font-medium text-zinc-200 transition-snappy hover:bg-[var(--border-accent)] disabled:cursor-wait disabled:opacity-50"
    >
      {isSwitching ? "Switching..." : "Activate"}
    </button>
  );
};

/* ─── Icon buttons ────────────────────────────── */

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const ConfirmDeleteOverlay = ({
  onConfirm,
  onCancel,
  isDeleting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) => (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[calc(1rem-1px)] bg-[var(--surface-raised)]/95 backdrop-blur-sm">
    <p className="text-sm font-medium text-zinc-100">Delete this profile?</p>
    <div className="flex gap-2">
      <button
        onClick={onConfirm}
        disabled={isDeleting}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-snappy hover:bg-red-500 disabled:opacity-50"
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </button>
      <button
        onClick={onCancel}
        disabled={isDeleting}
        className="rounded-lg bg-[var(--overlay-medium)] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-snappy hover:bg-[var(--border-accent)]"
      >
        Cancel
      </button>
    </div>
  </div>
);

/* ─── Card ────────────────────────────────────── */

export const ProfileCard = ({
  name,
  description,
  pluginCount,
  skillCount,
  hookEventCount,
  mcpServerCount,
  plugins,
  skills,
  hooks,
  enabledMcpServers,
  disabledMcpServers,
  isActive,
  isSwitching,
  onActivate,
  onEdit,
  onDelete,
}: ProfileCardProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleActivate = useCallback(() => {
    onActivate(name);
  }, [onActivate, name]);

  const handleEdit = useCallback(() => {
    onEdit({
      name,
      description,
      pluginCount,
      skillCount,
      hookEventCount,
      mcpServerCount,
      plugins,
      skills,
      hooks,
      enabledMcpServers,
      disabledMcpServers,
      isActive,
    });
  }, [name, description, pluginCount, skillCount, hookEventCount, mcpServerCount,
      plugins, skills, hooks, enabledMcpServers, disabledMcpServers, isActive,
      onEdit]);

  const handleDeleteClick = useCallback(() => {
    setIsConfirming(true);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setIsConfirming(false);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(name);
    } finally {
      setIsDeleting(false);
      setIsConfirming(false);
    }
  }, [onDelete, name]);

  const borderClass = isActive
    ? "ring-blue-500/40"
    : "ring-[var(--border-hairline)] hover:ring-[var(--border-accent)]";

  return (
    <div
      className={`rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 transition-snappy ${borderClass}`}
    >
      <div className="relative flex flex-col gap-3 rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        {isConfirming && (
          <ConfirmDeleteOverlay
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
            isDeleting={isDeleting}
          />
        )}

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold capitalize text-zinc-100">
              {name}
            </h3>
            {isActive && <ActiveBadge />}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleEdit}
              title="Edit profile"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-snappy hover:bg-[var(--overlay-subtle)] hover:text-zinc-300"
            >
              <PencilIcon />
            </button>
            <button
              onClick={handleDeleteClick}
              title="Delete profile"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-snappy hover:bg-red-500/10 hover:text-red-400"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-zinc-400">{description}</p>

        <div className="mt-auto flex flex-col gap-3">
          <SuiteBadges
            pluginCount={pluginCount}
            skillCount={skillCount}
            hookEventCount={hookEventCount}
            mcpServerCount={mcpServerCount}
          />
          <div className="flex gap-2">
            <ActivateButton
              isActive={isActive}
              isSwitching={isSwitching}
              onClick={handleActivate}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
