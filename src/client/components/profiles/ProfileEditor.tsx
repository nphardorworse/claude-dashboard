import { useState, useEffect, useCallback, useMemo } from "react";
import type { PluginInfo } from "../../../shared/types";
import { buildScopedUrl } from "../../lib/api";
import { Toggle } from "../shared/Toggle";
import { Badge } from "../shared/Badge";

type EditorMode = "create" | "edit";

type ProfileEditorProps = {
  mode: EditorMode;
  projectPath: string | null;
  initialName?: string;
  initialDescription?: string;
  initialPlugins?: Record<string, boolean>;
  onSave: (name: string, description: string, plugins: Record<string, boolean>) => Promise<void>;
  onCancel: () => void;
};

/* ─── Plugin row ──────────────────────────────── */

type PluginRowProps = {
  plugin: PluginInfo;
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
};

const PluginRow = ({ plugin, checked, onToggle }: PluginRowProps) => {
  const handleChange = useCallback(
    (val: boolean) => onToggle(plugin.id, val),
    [onToggle, plugin.id]
  );

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl bg-[var(--overlay-faint)] px-4 py-3 ring-1 ring-[var(--border-hairline)] transition-snappy ${
        checked ? "opacity-100" : "opacity-40"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-zinc-100">
            {plugin.name}
          </span>
          <Badge label={plugin.marketplace} variant="info" />
        </div>
        {plugin.description && (
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            {plugin.description}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <Toggle checked={checked} onChange={handleChange} />
      </div>
    </div>
  );
};

/* ─── Search input ────────────────────────────── */

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/* ─── Editor ──────────────────────────────────── */

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export const ProfileEditor = ({
  mode,
  projectPath,
  initialName = "",
  initialDescription = "",
  initialPlugins = {},
  onSave,
  onCancel,
}: ProfileEditorProps) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [enabledPlugins, setEnabledPlugins] = useState<Record<string, boolean>>(initialPlugins);
  const [availablePlugins, setAvailablePlugins] = useState<PluginInfo[]>([]);
  const [search, setSearch] = useState("");
  const [isLoadingPlugins, setIsLoadingPlugins] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available plugins
  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        const url = buildScopedUrl("/api/plugins", projectPath);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAvailablePlugins(data.plugins ?? []);
      } catch {
        setAvailablePlugins([]);
      } finally {
        setIsLoadingPlugins(false);
      }
    };
    fetchPlugins();
  }, [projectPath]);

  const handlePluginToggle = useCallback((id: string, checked: boolean) => {
    setEnabledPlugins((prev) => ({ ...prev, [id]: checked }));
  }, []);

  const filteredPlugins = useMemo(() => {
    if (!search.trim()) return availablePlugins;
    const q = search.toLowerCase();
    return availablePlugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.marketplace.toLowerCase().includes(q)
    );
  }, [availablePlugins, search]);

  const enabledCount = useMemo(
    () => Object.values(enabledPlugins).filter(Boolean).length,
    [enabledPlugins]
  );

  const handleSelectAll = useCallback(() => {
    setEnabledPlugins((prev) => {
      const next = { ...prev };
      for (const p of filteredPlugins) {
        next[p.id] = true;
      }
      return next;
    });
  }, [filteredPlugins]);

  const handleDeselectAll = useCallback(() => {
    setEnabledPlugins((prev) => {
      const next = { ...prev };
      for (const p of filteredPlugins) {
        next[p.id] = false;
      }
      return next;
    });
  }, [filteredPlugins]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Profile name is required");
      return;
    }
    if (!SAFE_NAME_RE.test(trimmedName)) {
      setError("Name must contain only letters, numbers, hyphens, and underscores");
      return;
    }

    // Filter to only enabled plugins
    const plugins: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(enabledPlugins)) {
      if (val) plugins[key] = true;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(trimmedName, description.trim(), plugins);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsSaving(false);
    }
  }, [name, description, enabledPlugins, onSave]);

  const isEditMode = mode === "edit";
  const title = isEditMode ? `Edit Profile: ${initialName}` : "Create New Profile";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-zinc-100">{title}</h2>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-lg bg-[var(--overlay-subtle)] px-4 py-2 text-sm font-medium text-zinc-300 ring-1 ring-[var(--border-hairline)] transition-snappy hover:bg-[var(--overlay-medium)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-snappy hover:bg-blue-500 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : isEditMode ? "Update Profile" : "Create Profile"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Name + Description */}
      <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
        <div className="flex flex-col gap-4 rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Profile Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEditMode}
              placeholder="e.g. my-mobile-setup"
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-snappy focus:border-blue-500/50 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this profile is for..."
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-snappy focus:border-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* Plugin selector */}
      <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
        <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
          {/* Toolbar */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                <SearchIcon />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search plugins..."
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-snappy focus:border-blue-500/50"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {enabledCount} selected
              </span>
              <button
                onClick={handleSelectAll}
                className="text-[11px] font-medium text-blue-400 transition-snappy hover:text-blue-300"
              >
                All
              </button>
              <button
                onClick={handleDeselectAll}
                className="text-[11px] font-medium text-zinc-500 transition-snappy hover:text-zinc-300"
              >
                None
              </button>
            </div>
          </div>

          {/* Plugin list */}
          {isLoadingPlugins ? (
            <p className="text-sm text-zinc-500">Loading plugins...</p>
          ) : (
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
              {filteredPlugins.map((plugin) => (
                <PluginRow
                  key={plugin.id}
                  plugin={plugin}
                  checked={!!enabledPlugins[plugin.id]}
                  onToggle={handlePluginToggle}
                />
              ))}
              {filteredPlugins.length === 0 && (
                <p className="py-4 text-center text-sm text-zinc-500">
                  {search ? "No plugins match your search" : "No plugins installed"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
