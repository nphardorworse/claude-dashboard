import { useCallback } from "react";
import { XIcon } from "../shared/NavIcons";
import { Card, CardContent } from "~/client/components/ui/card";
import type { HookCommand, HookEntry } from "../../../shared/types";

type HookEventCardProps = {
  event: string;
  hookEntries: HookEntry[];
  onDelete: (event: string) => void;
  onRemoveEntry: (event: string, entryIndex: number, hookIndex: number) => void;
};

type HookCommandRowProps = {
  matcher: string;
  hook: HookCommand;
  event: string;
  entryIndex: number;
  hookIndex: number;
  onRemove: (event: string, entryIndex: number, hookIndex: number) => void;
};

const HookCommandRow = ({
  matcher,
  hook,
  event,
  entryIndex,
  hookIndex,
  onRemove,
}: HookCommandRowProps) => {
  const handleRemove = useCallback(() => {
    onRemove(event, entryIndex, hookIndex);
  }, [onRemove, event, entryIndex, hookIndex]);

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded bg-[var(--overlay-medium)] px-1.5 py-0.5 font-mono text-xs text-zinc-300">
            {matcher}
          </span>
          {hook.timeout != null && (
            <span className="text-xs text-zinc-500">
              {hook.timeout}ms timeout
            </span>
          )}
        </div>
        <p className="mt-1 truncate font-mono text-xs text-zinc-400">
          {hook.command}
        </p>
      </div>
      <button
        onClick={handleRemove}
        className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-[var(--overlay-medium)] hover:text-red-400"
        title="Remove this hook"
      >
        <XIcon size={12} />
      </button>
    </div>
  );
};

const EmptyState = () => {
  return (
    <p className="py-2 text-xs text-zinc-500">No hooks configured</p>
  );
};

export const HookEventCard = ({
  event,
  hookEntries,
  onDelete,
  onRemoveEntry,
}: HookEventCardProps) => {
  const handleDelete = useCallback(() => {
    onDelete(event);
  }, [onDelete, event]);

  const allHooks: Array<{
    matcher: string;
    hook: HookCommand;
    entryIndex: number;
    hookIndex: number;
  }> = [];

  hookEntries.forEach((entry, entryIndex) => {
    entry.hooks.forEach((hook, hookIndex) => {
      allHooks.push({ matcher: entry.matcher, hook, entryIndex, hookIndex });
    });
  });

  const hasHooks = allHooks.length > 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">{event}</h3>
        {hasHooks && (
          <button
            onClick={handleDelete}
            className="rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            Remove All
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {hasHooks ? (
          allHooks.map((item) => (
            <HookCommandRow
              key={`${item.entryIndex}-${item.hookIndex}-${item.matcher}`}
              matcher={item.matcher}
              hook={item.hook}
              event={event}
              entryIndex={item.entryIndex}
              hookIndex={item.hookIndex}
              onRemove={onRemoveEntry}
            />
          ))
        ) : (
          <EmptyState />
        )}
      </div>
      </CardContent>
    </Card>
  );
};
