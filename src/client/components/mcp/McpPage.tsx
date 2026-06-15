import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch, buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { PageShell } from "../layout/PageShell";
import { ScopeBanner } from "../shared/ScopeBanner";
import { useToast } from "../shared/use-toast";
import { McpCatalogCard } from "./McpCatalogCard";
import { McpOriginGroup } from "./McpOriginGroup";
import { McpCatalogSection } from "./McpCatalogSection";
import { AddServerForm } from "./AddServerForm";
import { Button } from "~/client/components/ui/button";
import type {
  McpOrigin,
  McpCatalogEntry,
  McpCatalogGroup,
  McpServerConfig,
  CatalogResponse,
} from "../../../shared/types";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const fetchCatalog = async (
  projectPath: string | null
): Promise<CatalogResponse> => {
  const url = buildScopedUrl("/api/mcp/catalog", projectPath);
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const addServer = async (
  server: { name: string; command?: string; url?: string; args?: string[] },
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl("/api/mcp/servers", projectPath);
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(server),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

const deleteServer = async (
  name: string,
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl(
    `/api/mcp/servers/${encodeURIComponent(name)}`,
    projectPath
  );
  const response = await apiFetch(url, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

const refreshHealth = async (
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl("/api/mcp/health-check", projectPath);
  const response = await apiFetch(url, { method: "POST" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
};

const toggleGlobalMcp = async (
  mcpName: string,
  action: "enable" | "disable"
): Promise<void> => {
  const response = await apiFetch("/api/mcp/global-toggle", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mcpName, action }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

const toggleProjectMcp = async (
  projectPath: string,
  mcpName: string,
  origin: McpOrigin,
  action: "enable" | "disable"
): Promise<void> => {
  const response = await apiFetch("/api/mcp/project-toggle", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, mcpName, origin, action }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

// A plugin MCP has no independent global on/off — it follows its plugin's
// enabled state. Toggling it enables/disables the whole plugin(s) that provide
// it (skills, agents, and commands included), via the plugins bulk-toggle.
const togglePlugin = async (
  pluginIds: string[],
  enabled: boolean
): Promise<void> => {
  const response = await apiFetch("/api/plugins/bulk-toggle", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pluginIds, enabled }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

const copyToProject = async (
  mcpName: string,
  targetProjectPath: string,
  config?: McpServerConfig
): Promise<void> => {
  const response = await apiFetch("/api/mcp/copy-to-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Send the config from the catalog entry so the server can copy MCPs
    // defined in other projects' .mcp.json (it can't resolve those by name).
    body: JSON.stringify({ mcpName, targetProjectPath, config }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

const updatePinned = async (servers: string[]): Promise<void> => {
  const response = await apiFetch("/api/mcp/pinned", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ servers }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

// ---------------------------------------------------------------------------
// Helper: collect all entries from catalog groups
// ---------------------------------------------------------------------------

const collectAllEntries = (groups: McpCatalogGroup[]): McpCatalogEntry[] => {
  const result: McpCatalogEntry[] = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      result.push(entry);
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Presentational sub-components
// ---------------------------------------------------------------------------

const LoadingState = () => {
  return (
    <div className="flex items-center gap-2 py-12 text-zinc-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      <span className="text-sm">Loading MCP servers...</span>
    </div>
  );
};

const ErrorState = ({ message }: { message: string }) => {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
      <p className="text-sm text-red-400">
        Failed to load MCP servers: {message}
      </p>
    </div>
  );
};

const SummaryBar = ({
  totalCount,
  connectedCount,
}: {
  totalCount: number;
  connectedCount: number;
}) => {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-4 py-3">
      <p className="text-sm text-zinc-300">
        <span className="font-semibold text-zinc-100">{totalCount}</span>
        {" servers"}
        <span className="mx-2 text-zinc-500">|</span>
        <span className="font-semibold text-green-400">{connectedCount}</span>
        {" connected"}
      </p>
    </div>
  );
};

type ActionBarProps = {
  onRefresh: () => void;
  onToggleForm?: () => void;
  isRefreshing: boolean;
  isFormOpen?: boolean;
};

const ActionBar = ({
  onRefresh,
  onToggleForm,
  isRefreshing,
  isFormOpen = false,
}: ActionBarProps) => {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isRefreshing}>
        {isRefreshing ? "Checking..." : "Refresh Status"}
      </Button>
      {onToggleForm !== undefined && (
        <Button size="sm" onClick={onToggleForm}>
          {isFormOpen ? "Cancel" : "Add Server"}
        </Button>
      )}
    </div>
  );
};

const EmptyState = () => {
  return (
    <p className="py-8 text-center text-sm text-zinc-500">
      No MCP servers configured.
    </p>
  );
};

// ---------------------------------------------------------------------------
// Card builder helpers (avoid inline functions in JSX)
// ---------------------------------------------------------------------------

type CardItem = {
  key: string;
  entry: McpCatalogEntry;
  action?: { label: string; onClick: () => void };
  onPin?: (name: string) => void;
  onDelete?: (name: string) => void;
};

const CatalogCardItem = ({ item }: { item: CardItem }) => {
  return (
    <McpCatalogCard
      name={item.entry.name}
      origin={item.entry.origin}
      pluginName={item.entry.pluginName}
      pluginNames={item.entry.pluginNames}
      pluginEnabled={item.entry.pluginEnabled}
      health={item.entry.health}
      type={item.entry.config.type ?? "stdio"}
      command={item.entry.config.command ?? item.entry.config.url ?? "—"}
      isPinned={item.entry.isPinned}
      action={item.action}
      onPin={item.onPin}
      onDelete={item.onDelete}
    />
  );
};

const CardList = ({ items }: { items: CardItem[] }) => {
  if (items.length === 0) return null;

  const cards = items.map((item) => (
    <CatalogCardItem key={item.key} item={item} />
  ));

  return <div className="flex flex-col gap-2">{cards}</div>;
};

// ---------------------------------------------------------------------------
// Global view: group list (no inline .map in JSX)
// ---------------------------------------------------------------------------

type GlobalGroupListProps = {
  groups: McpCatalogGroup[];
  onGlobalToggle: (name: string, action: "enable" | "disable") => void;
  onPluginToggle: (entry: McpCatalogEntry, action: "enable" | "disable") => void;
  onPin: (name: string) => void;
  onDelete: (name: string) => void;
};

const getGlobalAction = (
  entry: McpCatalogEntry,
  onGlobalToggle: (name: string, action: "enable" | "disable") => void,
  onPluginToggle: (entry: McpCatalogEntry, action: "enable" | "disable") => void
): CardItem["action"] => {
  if (entry.isPinned) return undefined;
  if (entry.origin === "global") {
    return { label: "Disable", onClick: () => onGlobalToggle(entry.name, "disable") };
  }
  if (entry.origin === "global-disabled") {
    return { label: "Re-enable", onClick: () => onGlobalToggle(entry.name, "enable") };
  }
  // Plugin MCPs: toggle follows the plugin's enabled state.
  if (entry.origin === "plugin") {
    return entry.pluginEnabled === false
      ? { label: "Enable plugin", onClick: () => onPluginToggle(entry, "enable") }
      : { label: "Disable plugin", onClick: () => onPluginToggle(entry, "disable") };
  }
  return undefined;
};

const GlobalGroupList = ({ groups, onGlobalToggle, onPluginToggle, onPin, onDelete }: GlobalGroupListProps) => {
  if (groups.length === 0) {
    return <EmptyState />;
  }

  const groupElements = groups.map((group) => {
    const items: CardItem[] = group.entries.map((entry) => {
      const canDelete = entry.origin === "global" || entry.origin === "personal";
      return {
        key: `${entry.origin}-${entry.name}`,
        entry,
        action: getGlobalAction(entry, onGlobalToggle, onPluginToggle),
        onPin,
        onDelete: canDelete ? onDelete : undefined,
      };
    });

    return (
      <McpOriginGroup
        key={`${group.origin}-${group.pluginName ?? group.label}`}
        label={group.label}
        count={group.entries.length}
      >
        <CardList items={items} />
      </McpOriginGroup>
    );
  });

  return <div className="flex flex-col gap-4">{groupElements}</div>;
};

// ---------------------------------------------------------------------------
// Project view: Active / Disabled / Available sections
// ---------------------------------------------------------------------------

type ActiveSectionProps = {
  groups: McpCatalogGroup[];
  onToggle: (name: string, origin: McpOrigin, action: "enable" | "disable") => void;
  onPin: (name: string) => void;
};

const ActiveSection = ({ groups, onToggle, onPin }: ActiveSectionProps) => {
  const entries = collectAllEntries(groups);
  if (entries.length === 0) return null;

  const items: CardItem[] = entries.map((entry) => {
    let action: CardItem["action"];
    if (!entry.isPinned) {
      const isPersonal = entry.origin === "personal";
      action = {
        label: isPersonal ? "Remove" : "Disable",
        onClick: () => onToggle(entry.name, entry.origin, "disable"),
      };
    }
    return {
      key: `active-${entry.origin}-${entry.name}`,
      entry,
      action,
      onPin,
      onDelete: undefined,
    };
  });

  return (
    <McpCatalogSection title="Active in this project" count={entries.length}>
      <CardList items={items} />
    </McpCatalogSection>
  );
};

type DisabledSectionProps = {
  groups: McpCatalogGroup[];
  onToggle: (name: string, origin: McpOrigin, action: "enable" | "disable") => void;
  onPluginToggle: (entry: McpCatalogEntry, action: "enable" | "disable") => void;
};

const getDisabledAction = (
  entry: McpCatalogEntry,
  onToggle: (name: string, origin: McpOrigin, action: "enable" | "disable") => void,
  onPluginToggle: (entry: McpCatalogEntry, action: "enable" | "disable") => void
): CardItem["action"] => {
  // A plugin MCP disabled because its plugin is off can only be re-enabled by
  // turning the plugin back on — per-project enable wouldn't load it.
  if (entry.origin === "plugin" && entry.pluginEnabled === false) {
    return { label: "Enable plugin", onClick: () => onPluginToggle(entry, "enable") };
  }
  return {
    label: entry.origin === "global-disabled" ? "Re-enable globally" : "Enable",
    onClick: () => onToggle(entry.name, entry.origin, "enable"),
  };
};

const DisabledSection = ({ groups, onToggle, onPluginToggle }: DisabledSectionProps) => {
  const entries = collectAllEntries(groups);
  if (entries.length === 0) return null;

  const items: CardItem[] = entries.map((entry) => ({
    key: `disabled-${entry.origin}-${entry.name}`,
    entry,
    action: getDisabledAction(entry, onToggle, onPluginToggle),
    onPin: undefined,
    onDelete: undefined,
  }));

  return (
    <McpCatalogSection
      title="Disabled in this project"
      count={entries.length}
      defaultOpen={false}
    >
      <CardList items={items} />
    </McpCatalogSection>
  );
};

type AvailableSectionProps = {
  groups: McpCatalogGroup[];
  onCopyToProject: (entry: McpCatalogEntry) => void;
};

const AvailableSection = ({ groups, onCopyToProject }: AvailableSectionProps) => {
  // Flatten across the per-project groups and dedupe by name: the same MCP
  // (e.g. expo-mcp) is often defined in several other projects' .mcp.json with
  // different configs — show it once (first occurrence wins).
  const seen = new Set<string>();
  const entries: McpCatalogEntry[] = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);
      entries.push(entry);
    }
  }
  if (entries.length === 0) return null;

  const items: CardItem[] = entries.map((entry) => ({
    key: `available-${entry.name}`,
    entry,
    action: {
      label: "Add to project",
      onClick: () => onCopyToProject(entry),
    },
    onPin: undefined,
    onDelete: undefined,
  }));

  return (
    <McpCatalogSection
      title="Available from other sources"
      count={entries.length}
      defaultOpen={false}
    >
      <CardList items={items} />
    </McpCatalogSection>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type McpPageProps = {
  projectPath?: string | null;
  onClearProject?: () => void;
};

export const McpPage = ({ projectPath = null, onClearProject }: McpPageProps) => {
  const { toast } = useToast();

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // ------ data loading ------

  const loadCatalog = useCallback(async () => {
    try {
      const data = await fetchCatalog(projectPath);
      setCatalog(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [projectPath]);

  useEffect(() => {
    setIsLoading(true);
    loadCatalog().finally(() => setIsLoading(false));
  }, [loadCatalog]);

  // ------ action handlers ------

  const handleToggle = useCallback(
    async (mcpName: string, origin: McpOrigin, action: "enable" | "disable") => {
      if (!projectPath) return;

      // Personal disable is a permanent removal — confirm first
      if (origin === "personal" && action === "disable") {
        const confirmed = window.confirm(
          `Remove "${mcpName}"? This permanently deletes the server config from this project.`
        );
        if (!confirmed) return;
      }

      try {
        await toggleProjectMcp(projectPath, mcpName, origin, action);
        await loadCatalog();

        if (origin === "personal" && action === "disable") {
          toast(`${mcpName} removed`, "success");
        } else if (origin === "global-disabled" && action === "enable") {
          toast(`${mcpName} re-enabled globally`, "success");
        } else {
          toast(`${mcpName} ${action}d`, "success");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Toggle failed";
        toast(msg, "error");
      }
    },
    [projectPath, loadCatalog, toast]
  );

  const handleGlobalToggle = useCallback(
    async (mcpName: string, action: "enable" | "disable") => {
      try {
        await toggleGlobalMcp(mcpName, action);
        await loadCatalog();
        toast(`${mcpName} ${action}d globally`, "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Toggle failed";
        toast(msg, "error");
      }
    },
    [loadCatalog, toast]
  );

  const handlePluginToggle = useCallback(
    async (entry: McpCatalogEntry, action: "enable" | "disable") => {
      const pluginIds = entry.pluginIds ?? (entry.pluginId ? [entry.pluginId] : []);
      if (pluginIds.length === 0) {
        toast("Can't toggle: unknown plugin for this MCP", "error");
        return;
      }
      const pluginLabel = entry.pluginName ?? pluginIds.join(", ");
      if (action === "disable") {
        const confirmed = window.confirm(
          `Disable the "${pluginLabel}" plugin? This turns off "${entry.name}" plus any skills, agents, and commands the plugin provides. It's the only way Claude Code can disable a plugin's MCP globally.`
        );
        if (!confirmed) return;
      }
      try {
        await togglePlugin(pluginIds, action === "enable");
        await loadCatalog();
        toast(
          `${pluginLabel} plugin ${action === "enable" ? "enabled" : "disabled"}`,
          "success"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Plugin toggle failed";
        toast(msg, "error");
      }
    },
    [loadCatalog, toast]
  );

  const handleCopyToProject = useCallback(
    async (entry: McpCatalogEntry) => {
      if (!projectPath) return;
      try {
        await copyToProject(entry.name, projectPath, entry.config);
        await loadCatalog();
        toast(`${entry.name} added to project`, "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Copy failed";
        toast(msg, "error");
      }
    },
    [projectPath, loadCatalog, toast]
  );

  const handlePin = useCallback(
    async (mcpName: string) => {
      if (!catalog) return;
      const allEntries = collectAllEntries(catalog.groups);
      const currentPinned = allEntries
        .filter((e) => e.isPinned)
        .map((e) => e.name);

      const isCurrentlyPinned = currentPinned.includes(mcpName);
      const nextPinned = isCurrentlyPinned
        ? currentPinned.filter((n) => n !== mcpName)
        : [...currentPinned, mcpName];

      try {
        await updatePinned(nextPinned);
        await loadCatalog();
        toast(
          isCurrentlyPinned ? `${mcpName} unpinned` : `${mcpName} pinned`,
          "success"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Pin update failed";
        toast(msg, "error");
      }
    },
    [catalog, loadCatalog, toast]
  );

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await deleteServer(name, projectPath);
        await loadCatalog();
        toast(`${name} deleted`, "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed";
        toast(msg, "error");
      }
    },
    [loadCatalog, projectPath, toast]
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshHealth(projectPath);
      await loadCatalog();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refresh failed";
      toast(msg, "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [loadCatalog, projectPath, toast]);

  const handleAddServer = useCallback(
    async (server: { name: string; command?: string; url?: string; args?: string[] }) => {
      await addServer(server, projectPath);
      await loadCatalog();
      setIsFormOpen(false);
    },
    [loadCatalog, projectPath]
  );

  const handleToggleForm = useCallback(() => {
    setIsFormOpen((prev) => !prev);
  }, []);

  const handleCancelForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  // ------ derived data ------

  const pageTitle = useMemo(() => {
    if (projectPath) {
      return `MCP Servers (${getProjectDisplayName(projectPath)})`;
    }
    return "MCP Servers";
  }, [projectPath]);

  const isProjectView = projectPath !== null;

  // ------ render ------

  return (
    <PageShell title={pageTitle}>
      <div className="flex flex-col gap-4">
        <ScopeBanner
          projectPath={projectPath}
          configType="mcp"
          onClear={onClearProject}
        />

        {isLoading && <LoadingState />}

        {error !== null && <ErrorState message={error} />}

        {!isLoading && error === null && catalog !== null && !isProjectView && (
          <GlobalViewContent
            catalog={catalog}
            onRefresh={handleRefresh}
            onToggleForm={handleToggleForm}
            onCancelForm={handleCancelForm}
            onAddServer={handleAddServer}
            onGlobalToggle={handleGlobalToggle}
            onPluginToggle={handlePluginToggle}
            onPin={handlePin}
            onDelete={handleDelete}
            isRefreshing={isRefreshing}
            isFormOpen={isFormOpen}
          />
        )}

        {!isLoading && error === null && catalog !== null && isProjectView && (
          <ProjectViewContent
            catalog={catalog}
            onRefresh={handleRefresh}
            onToggle={handleToggle}
            onPluginToggle={handlePluginToggle}
            onCopyToProject={handleCopyToProject}
            onPin={handlePin}
            isRefreshing={isRefreshing}
          />
        )}
      </div>
    </PageShell>
  );
};

// ---------------------------------------------------------------------------
// Global view content
// ---------------------------------------------------------------------------

type GlobalViewContentProps = {
  catalog: CatalogResponse;
  onRefresh: () => void;
  onToggleForm: () => void;
  onCancelForm: () => void;
  onAddServer: (server: {
    name: string;
    command?: string;
    url?: string;
    args?: string[];
  }) => Promise<void>;
  onGlobalToggle: (name: string, action: "enable" | "disable") => void;
  onPluginToggle: (entry: McpCatalogEntry, action: "enable" | "disable") => void;
  onPin: (name: string) => void;
  onDelete: (name: string) => void;
  isRefreshing: boolean;
  isFormOpen: boolean;
};

const GlobalViewContent = ({
  catalog,
  onRefresh,
  onToggleForm,
  onCancelForm,
  onAddServer,
  onGlobalToggle,
  onPluginToggle,
  onPin,
  onDelete,
  isRefreshing,
  isFormOpen,
}: GlobalViewContentProps) => {
  return (
    <>
      <div className="flex items-center justify-between">
        <SummaryBar
          totalCount={catalog.totalCount}
          connectedCount={catalog.connectedCount}
        />
        <ActionBar
          onRefresh={onRefresh}
          onToggleForm={onToggleForm}
          isRefreshing={isRefreshing}
          isFormOpen={isFormOpen}
        />
      </div>

      {isFormOpen && (
        <AddServerForm onSubmit={onAddServer} onCancel={onCancelForm} />
      )}

      <GlobalGroupList
        groups={catalog.groups}
        onGlobalToggle={onGlobalToggle}
        onPluginToggle={onPluginToggle}
        onPin={onPin}
        onDelete={onDelete}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Project view content
// ---------------------------------------------------------------------------

type ProjectViewContentProps = {
  catalog: CatalogResponse;
  onRefresh: () => void;
  onToggle: (name: string, origin: McpOrigin, action: "enable" | "disable") => void;
  onPluginToggle: (entry: McpCatalogEntry, action: "enable" | "disable") => void;
  onCopyToProject: (entry: McpCatalogEntry) => void;
  onPin: (name: string) => void;
  isRefreshing: boolean;
};

const ProjectViewContent = ({
  catalog,
  onRefresh,
  onToggle,
  onPluginToggle,
  onCopyToProject,
  onPin,
  isRefreshing,
}: ProjectViewContentProps) => {
  return (
    <>
      <div className="flex items-center justify-between">
        <SummaryBar
          totalCount={catalog.totalCount}
          connectedCount={catalog.connectedCount}
        />
        <ActionBar onRefresh={onRefresh} isRefreshing={isRefreshing} />
      </div>

      <ActiveSection
        groups={catalog.active ?? []}
        onToggle={onToggle}
        onPin={onPin}
      />

      <DisabledSection
        groups={catalog.disabled ?? []}
        onToggle={onToggle}
        onPluginToggle={onPluginToggle}
      />

      <AvailableSection
        groups={catalog.available ?? []}
        onCopyToProject={onCopyToProject}
      />
    </>
  );
};
