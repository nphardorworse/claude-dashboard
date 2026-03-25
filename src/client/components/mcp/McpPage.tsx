import { useState, useEffect, useCallback, useMemo } from "react";
import { buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { PageShell } from "../layout/PageShell";
import { ScopeBanner } from "../shared/ScopeBanner";
import { useToast } from "../shared/Toast";
import { McpCatalogCard } from "./McpCatalogCard";
import { McpOriginGroup } from "./McpOriginGroup";
import { McpCatalogSection } from "./McpCatalogSection";
import { AddServerForm } from "./AddServerForm";
import type {
  McpOrigin,
  McpCatalogEntry,
  McpCatalogGroup,
  CatalogResponse,
} from "../../../shared/types";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const fetchCatalog = async (
  projectPath: string | null
): Promise<CatalogResponse> => {
  const url = buildScopedUrl("/api/mcp/catalog", projectPath);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const addServer = async (
  server: { name: string; command: string; args: string[] },
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl("/api/mcp/servers", projectPath);
  const response = await fetch(url, {
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
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

const refreshHealth = async (
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl("/api/mcp/health-check", projectPath);
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
};

const toggleProjectMcp = async (
  projectPath: string,
  mcpName: string,
  origin: McpOrigin,
  action: "enable" | "disable"
): Promise<void> => {
  const response = await fetch("/api/mcp/project-toggle", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, mcpName, origin, action }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

const copyToProject = async (
  mcpName: string,
  targetProjectPath: string
): Promise<void> => {
  const response = await fetch("/api/mcp/copy-to-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mcpName, targetProjectPath }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
};

const updatePinned = async (servers: string[]): Promise<void> => {
  const response = await fetch("/api/mcp/pinned", {
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
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="rounded-md border border-[var(--border-accent)] bg-[var(--overlay-medium)] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-snappy hover:bg-[var(--overlay-medium)] active:scale-[0.96] disabled:opacity-50"
      >
        {isRefreshing ? "Checking..." : "Refresh Status"}
      </button>
      {onToggleForm !== undefined && (
        <button
          type="button"
          onClick={onToggleForm}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-snappy hover:bg-blue-500 active:scale-[0.96]"
        >
          {isFormOpen ? "Cancel" : "Add Server"}
        </button>
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
  onPin: (name: string) => void;
  onDelete: (name: string) => void;
};

const GlobalGroupList = ({ groups, onPin, onDelete }: GlobalGroupListProps) => {
  if (groups.length === 0) {
    return <EmptyState />;
  }

  const groupElements = groups.map((group) => {
    const items: CardItem[] = group.entries.map((entry) => {
      const canDelete = entry.origin === "global" || entry.origin === "personal";
      return {
        key: `${entry.origin}-${entry.name}`,
        entry,
        action: undefined,
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

  const items: CardItem[] = entries.map((entry) => ({
    key: `active-${entry.origin}-${entry.name}`,
    entry,
    action: entry.isPinned
      ? undefined
      : {
          label: "Disable",
          onClick: () => onToggle(entry.name, entry.origin, "disable"),
        },
    onPin,
    onDelete: undefined,
  }));

  return (
    <McpCatalogSection title="Active in this project" count={entries.length}>
      <CardList items={items} />
    </McpCatalogSection>
  );
};

type DisabledSectionProps = {
  groups: McpCatalogGroup[];
  onToggle: (name: string, origin: McpOrigin, action: "enable" | "disable") => void;
};

const DisabledSection = ({ groups, onToggle }: DisabledSectionProps) => {
  const entries = collectAllEntries(groups);
  if (entries.length === 0) return null;

  const items: CardItem[] = entries.map((entry) => ({
    key: `disabled-${entry.origin}-${entry.name}`,
    entry,
    action: {
      label: "Enable",
      onClick: () => onToggle(entry.name, entry.origin, "enable"),
    },
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
  onCopyToProject: (name: string) => void;
};

const AvailableSection = ({ groups, onCopyToProject }: AvailableSectionProps) => {
  const totalCount = groups.reduce((sum, g) => sum + g.entries.length, 0);
  if (totalCount === 0) return null;

  const groupElements = groups.map((group) => {
    const items: CardItem[] = group.entries.map((entry) => ({
      key: `available-${entry.origin}-${entry.name}`,
      entry,
      action: {
        label: "Add to project",
        onClick: () => onCopyToProject(entry.name),
      },
      onPin: undefined,
      onDelete: undefined,
    }));

    return (
      <McpOriginGroup
        key={`available-${group.origin}-${group.pluginName ?? group.label}`}
        label={group.label}
        count={group.entries.length}
        defaultOpen={false}
      >
        <CardList items={items} />
      </McpOriginGroup>
    );
  });

  return (
    <McpCatalogSection
      title="Available from other sources"
      count={totalCount}
      defaultOpen={false}
    >
      <div className="flex flex-col gap-4">{groupElements}</div>
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
      try {
        await toggleProjectMcp(projectPath, mcpName, origin, action);
        await loadCatalog();
        toast(`${mcpName} ${action}d`, "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Toggle failed";
        toast(msg, "error");
      }
    },
    [projectPath, loadCatalog, toast]
  );

  const handleCopyToProject = useCallback(
    async (mcpName: string) => {
      if (!projectPath) return;
      try {
        await copyToProject(mcpName, projectPath);
        await loadCatalog();
        toast(`${mcpName} added to project`, "success");
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
    async (server: { name: string; command: string; args: string[] }) => {
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
    command: string;
    args: string[];
  }) => Promise<void>;
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
  onCopyToProject: (name: string) => void;
  onPin: (name: string) => void;
  isRefreshing: boolean;
};

const ProjectViewContent = ({
  catalog,
  onRefresh,
  onToggle,
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
      />

      <AvailableSection
        groups={catalog.available ?? []}
        onCopyToProject={onCopyToProject}
      />
    </>
  );
};
