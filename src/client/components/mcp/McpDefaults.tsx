import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "../shared/Toast";

type McpDefaultsProps = {
  /** All globally configured server names */
  serverNames: string[];
};

type DefaultsData = {
  defaultDisabledMcpServers: string[];
};

const fetchDefaults = async (): Promise<DefaultsData> => {
  const res = await fetch("/api/defaults");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const saveDefaults = async (servers: string[]): Promise<void> => {
  const res = await fetch("/api/defaults/disabled-mcps", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ servers }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

type ServerToggleRowProps = {
  name: string;
  isDisabled: boolean;
  onToggle: (name: string) => void;
};

const ServerToggleRow = ({ name, isDisabled, onToggle }: ServerToggleRowProps) => {
  const handleClick = useCallback(() => onToggle(name), [onToggle, name]);

  return (
    <button
      onClick={handleClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-medium ring-1 transition-snappy ${
        isDisabled
          ? "bg-red-500/10 text-red-400/80 ring-red-500/20"
          : "bg-emerald-500/10 text-emerald-400/80 ring-emerald-500/20"
      }`}
    >
      {name} {isDisabled ? "(off)" : "(on)"}
    </button>
  );
};

export const McpDefaults = ({ serverNames }: McpDefaultsProps) => {
  const [disabledSet, setDisabledSet] = useState<Set<string>>(new Set());
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchDefaults();
        const set = new Set(data.defaultDisabledMcpServers);
        setDisabledSet(set);
        setSavedSet(set);
      } catch {
        // Silent
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleToggle = useCallback((name: string) => {
    setDisabledSet((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const hasChanges = useMemo(() => {
    if (disabledSet.size !== savedSet.size) return true;
    for (const name of disabledSet) {
      if (!savedSet.has(name)) return true;
    }
    return false;
  }, [disabledSet, savedSet]);

  const handleSave = useCallback(async () => {
    try {
      const servers = Array.from(disabledSet);
      await saveDefaults(servers);
      setSavedSet(new Set(servers));
      toast("MCP defaults saved", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    }
  }, [disabledSet, toast]);

  if (isLoading) return null;

  return (
    <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
      <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-4 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Default MCP State for New Projects
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Click to toggle — disabled MCPs won't load in new project sessions
            </p>
          </div>
          {hasChanges && (
            <button
              onClick={handleSave}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-[11px] font-medium text-white transition-snappy hover:bg-blue-500 active:scale-95"
            >
              Save Defaults
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {serverNames.map((name) => (
            <ServerToggleRow
              key={name}
              name={name}
              isDisabled={disabledSet.has(name)}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
