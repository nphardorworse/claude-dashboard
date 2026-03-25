import { useState, useEffect, useCallback, useMemo } from "react";
import { buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { PageShell } from "../layout/PageShell";
import { ScopeBanner } from "../shared/ScopeBanner";
import { HookEventCard } from "./HookEventCard";
import { AddHookForm } from "./AddHookForm";

type HookCommand = {
  type: string;
  command: string;
  timeout?: number;
};

type HookEntry = {
  matcher: string;
  hooks: HookCommand[];
};

type HooksResponse = {
  hooks: Record<string, HookEntry[]>;
  availableEvents: string[];
  activeEventCount: number;
  totalHookCount: number;
  error?: string;
};

const fetchHooks = async (
  projectPath: string | null
): Promise<HooksResponse> => {
  const url = buildScopedUrl("/api/hooks", projectPath);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
};

const addHook = async (
  data: {
    event: string;
    matcher: string;
    command: string;
    timeout?: number;
  },
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl("/api/hooks/add", projectPath);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
};

const deleteEvent = async (
  event: string,
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl(
    `/api/hooks/${encodeURIComponent(event)}`,
    projectPath
  );
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
};

const updateEventHooks = async (
  event: string,
  hooks: HookEntry[],
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl("/api/hooks", projectPath);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, hooks }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
};

const SummaryBar = ({
  activeEventCount,
  totalHookCount,
}: {
  activeEventCount: number;
  totalHookCount: number;
}) => {
  return (
    <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
      <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] px-4 py-3 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-zinc-100">{activeEventCount}</span>
          {" events active"}
          <span className="mx-2 text-zinc-500">|</span>
          <span className="font-semibold text-zinc-100">{totalHookCount}</span>
          {" total hooks"}
        </p>
      </div>
    </div>
  );
};

const LoadingState = () => {
  return (
    <div className="flex items-center gap-2 py-12 text-zinc-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      <span className="text-sm">Loading hooks...</span>
    </div>
  );
};

const ErrorState = ({ message }: { message: string }) => {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
      <p className="text-sm text-red-400">Failed to load hooks: {message}</p>
    </div>
  );
};

const InactiveEventsSection = ({
  events,
  isExpanded,
  onToggle,
}: {
  events: string[];
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-faint)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-medium text-zinc-500">
          {events.length} available events without hooks
        </span>
        <span className="text-xs text-zinc-500">
          {isExpanded ? "Hide" : "Show"}
        </span>
      </button>

      {isExpanded && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--border-hairline)] px-4 py-3">
          {events.map((event) => (
            <span
              key={event}
              className="rounded bg-[var(--overlay-subtle)] px-2 py-1 text-xs text-zinc-500"
            >
              {event}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

type HooksPageProps = {
  projectPath?: string | null;
  onClearProject?: () => void;
};

export const HooksPage = ({ projectPath = null, onClearProject }: HooksPageProps) => {
  const [hooksData, setHooksData] = useState<HooksResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isInactiveExpanded, setIsInactiveExpanded] = useState(false);

  const loadHooks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchHooks(projectPath);
      setHooksData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadHooks();
  }, [loadHooks]);

  const handleAddHook = useCallback(
    async (data: {
      event: string;
      matcher: string;
      command: string;
      timeout?: number;
    }) => {
      await addHook(data, projectPath);
      await loadHooks();
    },
    [loadHooks, projectPath]
  );

  const handleDeleteEvent = useCallback(
    async (event: string) => {
      const confirmed = window.confirm(
        `Remove all hooks for "${event}"?`
      );
      if (!confirmed) return;

      try {
        await deleteEvent(event, projectPath);
        await loadHooks();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete event");
      }
    },
    [loadHooks, projectPath]
  );

  const handleRemoveEntry = useCallback(
    async (event: string, entryIndex: number, hookIndex: number) => {
      const confirmed = window.confirm("Remove this hook?");
      if (!confirmed) return;

      if (!hooksData) return;

      const entries = hooksData.hooks[event];
      if (!entries) return;

      // Deep clone the entries to avoid mutating state
      const updatedEntries: HookEntry[] = entries.map((entry) => ({
        matcher: entry.matcher,
        hooks: [...entry.hooks],
      }));

      // Remove the specific hook command
      updatedEntries[entryIndex].hooks.splice(hookIndex, 1);

      // If the entry has no more hooks, remove the entry
      const filtered = updatedEntries.filter(
        (entry) => entry.hooks.length > 0
      );

      try {
        await updateEventHooks(event, filtered, projectPath);
        await loadHooks();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to remove hook"
        );
      }
    },
    [hooksData, loadHooks, projectPath]
  );

  const handleOpenForm = useCallback(() => {
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  const handleToggleInactive = useCallback(() => {
    setIsInactiveExpanded((prev) => !prev);
  }, []);

  const activeEvents = useMemo(() => {
    if (!hooksData) return [];
    return Object.keys(hooksData.hooks).sort();
  }, [hooksData]);

  const inactiveEvents = useMemo(() => {
    if (!hooksData) return [];
    const activeSet = new Set(Object.keys(hooksData.hooks));
    return hooksData.availableEvents.filter((e) => !activeSet.has(e));
  }, [hooksData]);

  const pageTitle = projectPath
    ? `Hooks (${getProjectDisplayName(projectPath)})`
    : "Hooks";

  return (
    <PageShell title={pageTitle}>
      <div className="flex flex-col gap-4">
        <ScopeBanner projectPath={projectPath} configType="hooks" onClear={onClearProject} />

        {isLoading && <LoadingState />}

        {error && <ErrorState message={error} />}

        {!isLoading && !error && hooksData && (
          <>
            <div className="flex items-center justify-between">
              <SummaryBar
                activeEventCount={hooksData.activeEventCount}
                totalHookCount={hooksData.totalHookCount}
              />

              {!isFormOpen && (
                <button
                  onClick={handleOpenForm}
                  className="ml-4 shrink-0 rounded-lg bg-[var(--overlay-medium)] px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-[var(--overlay-medium)]"
                >
                  Add Hook
                </button>
              )}
            </div>

            {isFormOpen && (
              <AddHookForm
                availableEvents={hooksData.availableEvents}
                onSubmit={handleAddHook}
                onCancel={handleCloseForm}
              />
            )}

            <div className="flex flex-col gap-3">
              {activeEvents.map((event) => (
                <HookEventCard
                  key={event}
                  event={event}
                  hookEntries={hooksData.hooks[event]}
                  onDelete={() => handleDeleteEvent(event)}
                  onRemoveEntry={(entryIndex, hookIndex) =>
                    handleRemoveEntry(event, entryIndex, hookIndex)
                  }
                />
              ))}
            </div>

            {activeEvents.length === 0 && !isFormOpen && (
              <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
                <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] px-4 py-8 text-center shadow-[inset_0_1px_1px_var(--glow-inset)]">
                  <p className="text-sm text-zinc-500">
                    No hooks configured yet.
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Click "Add Hook" to get started.
                  </p>
                </div>
              </div>
            )}

            <InactiveEventsSection
              events={inactiveEvents}
              isExpanded={isInactiveExpanded}
              onToggle={handleToggleInactive}
            />
          </>
        )}
      </div>
    </PageShell>
  );
};
