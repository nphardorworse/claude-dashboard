import { useState, useEffect, useCallback, useMemo, useRef, useId } from "react";
import type { KeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import type { ProjectInfo } from "../../../shared/types";
import { cn } from "~/client/lib/utils";

type ProjectSelectorProps = {
  projectPath: string | null;
  onSelect: (path: string | null) => void;
};

type Option = { value: string | null; label: string; detail?: string };

const fetchProjects = async (): Promise<ProjectInfo[]> => {
  try {
    const res = await fetch("/api/projects");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.projects ?? [];
  } catch {
    return [];
  }
};

const GLOBAL_OPTION: Option = { value: null, label: "Global" };

/** Every word of the query must appear in the project's name or path. */
const matchesQuery = (option: Option, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${option.label} ${option.detail ?? ""}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
};

export const ProjectSelector = ({
  projectPath,
  onSelect,
}: ProjectSelectorProps) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const loadProjects = useCallback(async () => {
    const data = await fetchProjects();
    setProjects(data);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const options = useMemo<Option[]>(
    () => [
      GLOBAL_OPTION,
      ...projects.map((p) => ({ value: p.path, label: p.name, detail: p.path })),
    ],
    [projects]
  );

  const filtered = useMemo(
    () => (query.trim() ? options.filter((o) => matchesQuery(o, query)) : options),
    [options, query]
  );

  const selected = useMemo(
    () => options.find((o) => o.value === projectPath) ?? GLOBAL_OPTION,
    [options, projectPath]
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setHighlighted(0);
    }
  }, []);

  const choose = useCallback(
    (option: Option) => {
      onSelect(option.value);
      setOpen(false);
    },
    [onSelect]
  );

  // Keep the highlighted row on screen while moving with the arrow keys.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlighted];
      if (option) choose(option);
    }
  };

  return (
    <div className="px-4 py-3 border-b border-[var(--border-hairline)]">
      <label htmlFor="project-scope-select" className="mb-1.5 block text-xs font-medium text-zinc-400">
        Scope
      </label>
      <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <PopoverPrimitive.Trigger
          id="project-scope-select"
          type="button"
          title={projectPath ?? "Global settings"}
          aria-label={`Scope: ${selected.label}`}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
        >
          <span className="truncate">{selected.label}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
            }}
            className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[14rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          >
            <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3">
              <SearchIcon className="size-4 shrink-0 text-zinc-500" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={filtered[highlighted] ? `${listId}-${highlighted}` : undefined}
                aria-label="Search projects"
                placeholder="Search projects..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlighted(0);
                }}
                onKeyDown={handleKeyDown}
                className="h-9 w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
              />
            </div>
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="Projects"
              className="max-h-80 overflow-y-auto p-1"
            >
              {filtered.length === 0 && (
                <li className="px-2 py-6 text-center text-xs text-zinc-500">No matching projects</li>
              )}
              {filtered.map((option, index) => {
                const isSelected = option.value === projectPath;
                return (
                  // Keyboard selection is on the search input (combobox with
                  // aria-activedescendant), so focus never moves to options.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li
                    key={option.value ?? "__global__"}
                    id={`${listId}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    title={option.detail}
                    onMouseMove={() => setHighlighted(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(option)}
                    className={cn(
                      "relative flex cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm select-none",
                      index === highlighted && "bg-accent text-accent-foreground"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && (
                      <CheckIcon className="absolute right-2 size-4" />
                    )}
                  </li>
                );
              })}
            </ul>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {projectPath && (
        <p className="mt-1 truncate text-[10px] text-zinc-500" dir="rtl" title={projectPath}>
          {projectPath}
        </p>
      )}
    </div>
  );
};
