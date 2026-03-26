import { useState, useEffect, useCallback, useMemo } from "react";
import type { PluginInfo, SkillInfo, HooksMap } from "../../../shared/types";
import { buildScopedUrl } from "../../lib/api";
import { Toggle } from "../shared/Toggle";
import { Badge } from "../shared/Badge";

type EditorMode = "create" | "edit";
type EditorTab = "plugins" | "skills" | "hooks" | "mcp";

type ProfileEditorProps = {
  mode: EditorMode;
  projectPath: string | null;
  initialName?: string;
  initialDescription?: string;
  initialPlugins?: Record<string, boolean>;
  initialSkills?: Record<string, boolean>;
  initialHooks?: HooksMap;
  initialEnabledMcpServers?: string[];
  initialDisabledMcpServers?: string[];
  onSave: (
    name: string,
    description: string,
    plugins: Record<string, boolean>,
    skills: Record<string, boolean>,
    hooks: HooksMap,
    enabledMcpServers: string[],
    disabledMcpServers: string[]
  ) => Promise<void>;
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

/* ─── Skill row ───────────────────────────────── */

type SkillRowProps = {
  skill: SkillInfo;
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
};

const SkillRow = ({ skill, checked, onToggle }: SkillRowProps) => {
  const handleChange = useCallback(
    (val: boolean) => onToggle(skill.id, val),
    [onToggle, skill.id]
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
            {skill.name}
          </span>
          {skill.pluginName && (
            <Badge label={skill.pluginName} variant="info" />
          )}
        </div>
        {skill.description && (
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            {skill.description}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <Toggle checked={checked} onChange={handleChange} />
      </div>
    </div>
  );
};

/* ─── Hook event row ──────────────────────────── */

type HookEventRowProps = {
  eventName: string;
  matcherCount: number;
  commandCount: number;
  included: boolean;
  onToggle: (event: string, included: boolean) => void;
};

const HookEventRow = ({ eventName, matcherCount, commandCount, included, onToggle }: HookEventRowProps) => {
  const handleChange = useCallback(
    (val: boolean) => onToggle(eventName, val),
    [onToggle, eventName]
  );

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl bg-[var(--overlay-faint)] px-4 py-3 ring-1 ring-[var(--border-hairline)] transition-snappy ${
        included ? "opacity-100" : "opacity-40"
      }`}
    >
      <div className="min-w-0 flex-1">
        <span className="truncate text-[13px] font-medium text-zinc-100">
          {eventName}
        </span>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {matcherCount} {matcherCount === 1 ? "matcher" : "matchers"}, {commandCount} {commandCount === 1 ? "command" : "commands"}
        </p>
      </div>
      <div className="shrink-0">
        <Toggle checked={included} onChange={handleChange} />
      </div>
    </div>
  );
};

/* ─── MCP row ─────────────────────────────────── */

type McpRowProps = {
  name: string;
  enabled: boolean;
  onToggle: (name: string, enabled: boolean) => void;
};

const McpRow = ({ name, enabled, onToggle }: McpRowProps) => {
  const handleChange = useCallback(
    (val: boolean) => onToggle(name, val),
    [onToggle, name]
  );

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl bg-[var(--overlay-faint)] px-4 py-3 ring-1 ring-[var(--border-hairline)] transition-snappy ${
        enabled ? "opacity-100" : "opacity-40"
      }`}
    >
      <span className="truncate text-[13px] font-medium text-zinc-100">
        {name}
      </span>
      <div className="shrink-0">
        <Toggle checked={enabled} onChange={handleChange} />
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

/* ─── Tab bar ─────────────────────────────────── */

const TABS: { key: EditorTab; label: string }[] = [
  { key: "plugins", label: "Plugins" },
  { key: "skills", label: "Skills" },
  { key: "hooks", label: "Hooks" },
  { key: "mcp", label: "MCP" },
];

const TabBar = ({
  activeTab,
  onChange,
  counts,
}: {
  activeTab: EditorTab;
  onChange: (tab: EditorTab) => void;
  counts: Record<EditorTab, number>;
}) => (
  <div className="flex gap-1 rounded-lg bg-[var(--overlay-faint)] p-1">
    {TABS.map(({ key, label }) => (
      <button
        key={key}
        onClick={() => onChange(key)}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-snappy ${
          activeTab === key
            ? "bg-[var(--overlay-medium)] text-zinc-100 shadow-sm"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        {label}
        <span className="rounded-full bg-[var(--overlay-subtle)] px-1.5 py-0.5 text-[10px] text-zinc-400">
          {counts[key]}
        </span>
      </button>
    ))}
  </div>
);

/* ─── Editor ──────────────────────────────────── */

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export const ProfileEditor = ({
  mode,
  projectPath,
  initialName = "",
  initialDescription = "",
  initialPlugins = {},
  initialSkills = {},
  initialHooks = {},
  initialEnabledMcpServers = [],
  initialDisabledMcpServers = [],
  onSave,
  onCancel,
}: ProfileEditorProps) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [activeTab, setActiveTab] = useState<EditorTab>("plugins");

  // Plugins state
  const [enabledPlugins, setEnabledPlugins] = useState<Record<string, boolean>>(initialPlugins);
  const [availablePlugins, setAvailablePlugins] = useState<PluginInfo[]>([]);

  // Skills state
  const [enabledSkills, setEnabledSkills] = useState<Record<string, boolean>>(initialSkills);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);

  // Hooks state
  const [hooksMap, setHooksMap] = useState<HooksMap>(initialHooks);
  const [includedHookEvents, setIncludedHookEvents] = useState<Set<string>>(
    new Set(Object.keys(initialHooks))
  );

  // MCP state
  const [mcpEnabled, setMcpEnabled] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const n of initialEnabledMcpServers) map[n] = true;
    for (const n of initialDisabledMcpServers) map[n] = false;
    return map;
  });

  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available plugins, skills, MCP servers
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pluginsRes, skillsRes, mcpRes] = await Promise.all([
          fetch(buildScopedUrl("/api/plugins", projectPath)),
          fetch(buildScopedUrl("/api/skills", projectPath)),
          fetch(buildScopedUrl("/api/mcp/catalog", projectPath)),
        ]);

        if (pluginsRes.ok) {
          const data = await pluginsRes.json();
          setAvailablePlugins(data.plugins ?? []);
        }
        if (skillsRes.ok) {
          const data = await skillsRes.json();
          setAvailableSkills(data.skills ?? []);
        }
        if (mcpRes.ok) {
          const data = await mcpRes.json();
          setMcpEnabled((prev) => {
            const next = { ...prev };
            for (const group of data.groups ?? []) {
              for (const entry of group.entries ?? []) {
                if (!(entry.name in next)) {
                  next[entry.name] = group.origin !== "global-disabled";
                }
              }
            }
            return next;
          });
        }
      } catch {
        // Lists stay empty
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [projectPath]);

  // ─── Toggles ───────────────────────────────────

  const handlePluginToggle = useCallback((id: string, checked: boolean) => {
    setEnabledPlugins((prev) => ({ ...prev, [id]: checked }));
  }, []);

  const handleSkillToggle = useCallback((id: string, checked: boolean) => {
    setEnabledSkills((prev) => ({ ...prev, [id]: checked }));
  }, []);

  const handleHookToggle = useCallback((event: string, included: boolean) => {
    setIncludedHookEvents((prev) => {
      const next = new Set(prev);
      if (included) next.add(event);
      else next.delete(event);
      return next;
    });
  }, []);

  const handleMcpToggle = useCallback((mcpName: string, enabled: boolean) => {
    setMcpEnabled((prev) => ({ ...prev, [mcpName]: enabled }));
  }, []);

  // ─── Filtered lists ────────────────────────────

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

  const filteredSkills = useMemo(() => {
    if (!search.trim()) return availableSkills;
    const q = search.toLowerCase();
    return availableSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        (s.pluginName ?? "").toLowerCase().includes(q)
    );
  }, [availableSkills, search]);

  const hookEvents = useMemo(() => Object.keys(hooksMap), [hooksMap]);

  const mcpServers = useMemo(() => Object.keys(mcpEnabled).sort(), [mcpEnabled]);

  // ─── Counts ────────────────────────────────────

  const enabledPluginCount = useMemo(
    () => Object.values(enabledPlugins).filter(Boolean).length,
    [enabledPlugins]
  );

  const enabledSkillCount = useMemo(
    () => Object.values(enabledSkills).filter(Boolean).length,
    [enabledSkills]
  );

  const counts: Record<EditorTab, number> = useMemo(
    () => ({
      plugins: enabledPluginCount,
      skills: enabledSkillCount,
      hooks: includedHookEvents.size,
      mcp: Object.values(mcpEnabled).filter(Boolean).length,
    }),
    [enabledPluginCount, enabledSkillCount, includedHookEvents.size, mcpEnabled]
  );

  // ─── Select all / Deselect all ─────────────────

  const handleSelectAll = useCallback(() => {
    if (activeTab === "plugins") {
      setEnabledPlugins((prev) => {
        const next = { ...prev };
        for (const p of filteredPlugins) next[p.id] = true;
        return next;
      });
    } else if (activeTab === "skills") {
      setEnabledSkills((prev) => {
        const next = { ...prev };
        for (const s of filteredSkills) next[s.id] = true;
        return next;
      });
    } else if (activeTab === "hooks") {
      setIncludedHookEvents(new Set(hookEvents));
    } else if (activeTab === "mcp") {
      setMcpEnabled((prev) => {
        const next = { ...prev };
        for (const n of mcpServers) next[n] = true;
        return next;
      });
    }
  }, [activeTab, filteredPlugins, filteredSkills, hookEvents, mcpServers]);

  const handleDeselectAll = useCallback(() => {
    if (activeTab === "plugins") {
      setEnabledPlugins((prev) => {
        const next = { ...prev };
        for (const p of filteredPlugins) next[p.id] = false;
        return next;
      });
    } else if (activeTab === "skills") {
      setEnabledSkills((prev) => {
        const next = { ...prev };
        for (const s of filteredSkills) next[s.id] = false;
        return next;
      });
    } else if (activeTab === "hooks") {
      setIncludedHookEvents(new Set());
    } else if (activeTab === "mcp") {
      setMcpEnabled((prev) => {
        const next = { ...prev };
        for (const n of mcpServers) next[n] = false;
        return next;
      });
    }
  }, [activeTab, filteredPlugins, filteredSkills, mcpServers]);

  // ─── Submit ────────────────────────────────────

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

    const plugins: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(enabledPlugins)) {
      if (val) plugins[key] = true;
    }

    const skills: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(enabledSkills)) {
      if (val) skills[key] = true;
    }

    const hooks: HooksMap = {};
    for (const event of includedHookEvents) {
      if (hooksMap[event]) hooks[event] = hooksMap[event];
    }

    const enabledMcpServers: string[] = [];
    const disabledMcpServers: string[] = [];
    for (const [mcpName, enabled] of Object.entries(mcpEnabled)) {
      if (enabled) enabledMcpServers.push(mcpName);
      else disabledMcpServers.push(mcpName);
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(trimmedName, description.trim(), plugins, skills, hooks, enabledMcpServers, disabledMcpServers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsSaving(false);
    }
  }, [name, description, enabledPlugins, enabledSkills, hooksMap, includedHookEvents, mcpEnabled, onSave]);

  // ─── Derived ───────────────────────────────────

  const isEditMode = mode === "edit";
  const title = isEditMode ? `Edit Profile: ${initialName}` : "Create New Profile";
  const showSearch = activeTab === "plugins" || activeTab === "skills";

  const selectedCountLabel = useMemo(() => {
    if (activeTab === "plugins") return `${enabledPluginCount} selected`;
    if (activeTab === "skills") return `${enabledSkillCount} selected`;
    if (activeTab === "hooks") return `${includedHookEvents.size} included`;
    return `${Object.values(mcpEnabled).filter(Boolean).length} enabled`;
  }, [activeTab, enabledPluginCount, enabledSkillCount, includedHookEvents.size, mcpEnabled]);

  const searchPlaceholder = activeTab === "plugins" ? "Search plugins..." : "Search skills...";

  // ─── Render ────────────────────────────────────

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

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Name + Description */}
      <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
        <div className="flex flex-col gap-4 rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-name" className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Profile Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEditMode}
              placeholder="e.g. my-mobile-setup"
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-snappy focus:border-blue-500/50 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-description" className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Description
            </label>
            <input
              id="profile-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this profile is for..."
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-snappy focus:border-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* Tabbed content */}
      <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
        <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <TabBar activeTab={activeTab} onChange={setActiveTab} counts={counts} />

            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">{selectedCountLabel}</span>
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

          {/* Search (plugins/skills only) */}
          {showSearch && (
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                <SearchIcon />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-snappy focus:border-blue-500/50"
              />
            </div>
          )}

          {/* Tab content */}
          {isLoading ? (
            <p className="text-sm text-zinc-500">Loading...</p>
          ) : (
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
              {/* Plugins tab */}
              {activeTab === "plugins" && (
                <>
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
                </>
              )}

              {/* Skills tab */}
              {activeTab === "skills" && (
                <>
                  {filteredSkills.map((skill) => (
                    <SkillRow
                      key={skill.id}
                      skill={skill}
                      checked={!!enabledSkills[skill.id]}
                      onToggle={handleSkillToggle}
                    />
                  ))}
                  {filteredSkills.length === 0 && (
                    <p className="py-4 text-center text-sm text-zinc-500">
                      {search ? "No skills match your search" : "No skills available"}
                    </p>
                  )}
                </>
              )}

              {/* Hooks tab */}
              {activeTab === "hooks" && (
                <>
                  {hookEvents.map((event) => {
                    const entries = hooksMap[event] ?? [];
                    const matcherCount = entries.length;
                    const commandCount = entries.reduce((sum, e) => sum + (e.hooks?.length ?? 0), 0);
                    return (
                      <HookEventRow
                        key={event}
                        eventName={event}
                        matcherCount={matcherCount}
                        commandCount={commandCount}
                        included={includedHookEvents.has(event)}
                        onToggle={handleHookToggle}
                      />
                    );
                  })}
                  {hookEvents.length === 0 && (
                    <p className="py-4 text-center text-sm text-zinc-500">
                      No hook events configured
                    </p>
                  )}
                </>
              )}

              {/* MCP tab */}
              {activeTab === "mcp" && (
                <>
                  {mcpServers.map((serverName) => (
                    <McpRow
                      key={serverName}
                      name={serverName}
                      enabled={!!mcpEnabled[serverName]}
                      onToggle={handleMcpToggle}
                    />
                  ))}
                  {mcpServers.length === 0 && (
                    <p className="py-4 text-center text-sm text-zinc-500">
                      No MCP servers found
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
