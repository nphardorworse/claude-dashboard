import { useState, useEffect, useCallback, useMemo } from "react";
import { buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { PageShell } from "../layout/PageShell";
import { ScopeBanner } from "../shared/ScopeBanner";
import { McpServerCard } from "./McpServerCard";
import { AddServerForm } from "./AddServerForm";
import { McpDefaults } from "./McpDefaults";
import { ApplyDefaultsButton } from "./ApplyDefaultsButton";

type McpServerStatus = "connected" | "needs_auth" | "failed" | "unknown";

type McpServerInfo = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  type: string;
  status: McpServerStatus;
  source?: "global" | "project-file" | "project-settings";
};

type ServersResponse = {
  servers: McpServerInfo[];
  connectedCount: number;
  disabledServers?: string[];
  error?: string;
};

const fetchServers = async (
  projectPath: string | null
): Promise<ServersResponse> => {
  const url = buildScopedUrl("/api/mcp/servers", projectPath);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
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
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
};

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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="text-sm text-zinc-300">
        <span className="font-semibold text-zinc-100">{totalCount}</span>
        {" servers"}
        <span className="mx-2 text-zinc-600">|</span>
        <span className="font-semibold text-green-400">{connectedCount}</span>
        {" connected"}
      </p>
    </div>
  );
};

const ServerList = ({
  servers,
  onDelete,
}: {
  servers: McpServerInfo[];
  onDelete: (name: string) => void;
}) => {
  if (servers.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No MCP servers configured.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {servers.map((server) => (
        <McpServerCard
          key={server.name}
          name={server.name}
          command={server.command}
          args={server.args}
          type={server.type}
          status={server.status}
          source={server.source}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

const ActionBar = ({
  onRefresh,
  onToggleForm,
  isRefreshing,
  isFormOpen,
}: {
  onRefresh: () => void;
  onToggleForm: () => void;
  isRefreshing: boolean;
  isFormOpen: boolean;
}) => {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {isRefreshing ? "Checking..." : "Refresh Status"}
      </button>
      <button
        type="button"
        onClick={onToggleForm}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
      >
        {isFormOpen ? "Cancel" : "Add Server"}
      </button>
    </div>
  );
};

const DisabledServersList = ({ names }: { names: string[] }) => {
  return (
    <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
      <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
          Disabled / Previously Removed
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          These servers were disabled or removed in some project contexts
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {names.map((name) => (
            <span
              key={name}
              className="rounded-full bg-[var(--overlay-faint)] px-3 py-1 text-[11px] text-zinc-500 ring-1 ring-[var(--border-hairline)]"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

type McpPageProps = {
  projectPath?: string | null;
  onClearProject?: () => void;
};

export const McpPage = ({ projectPath = null, onClearProject }: McpPageProps) => {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [connectedCount, setConnectedCount] = useState(0);
  const [disabledServers, setDisabledServers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const loadServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchServers(projectPath);
      setServers(data.servers);
      setConnectedCount(data.connectedCount);
      setDisabledServers(data.disabledServers ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshHealth(projectPath);
      await loadServers();
    } catch (err) {
      console.error("Health check failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadServers, projectPath]);

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await deleteServer(name, projectPath);
        await loadServers();
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [loadServers, projectPath]
  );

  const handleAddServer = useCallback(
    async (server: { name: string; command: string; args: string[] }) => {
      await addServer(server, projectPath);
      await loadServers();
      setIsFormOpen(false);
    },
    [loadServers, projectPath]
  );

  const handleToggleForm = useCallback(() => {
    setIsFormOpen((prev) => !prev);
  }, []);

  const handleCancelForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  const serverNames = useMemo(
    () => servers.map((s) => s.name),
    [servers]
  );

  const pageTitle = projectPath
    ? `MCP Servers (${getProjectDisplayName(projectPath)})`
    : "MCP Servers";

  return (
    <PageShell title={pageTitle}>
      <div className="flex flex-col gap-4">
        <ScopeBanner projectPath={projectPath} configType="mcp" onClear={onClearProject} />

        {isLoading && <LoadingState />}

        {error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <>
            <div className="flex items-center justify-between">
              <SummaryBar
                totalCount={servers.length}
                connectedCount={connectedCount}
              />
              <ActionBar
                onRefresh={handleRefresh}
                onToggleForm={handleToggleForm}
                isRefreshing={isRefreshing}
                isFormOpen={isFormOpen}
              />
            </div>

            {isFormOpen && (
              <AddServerForm
                onSubmit={handleAddServer}
                onCancel={handleCancelForm}
              />
            )}

            <ServerList servers={servers} onDelete={handleDelete} />

            {disabledServers.length > 0 && (
              <DisabledServersList names={disabledServers} />
            )}

            {!projectPath && (
              <McpDefaults serverNames={serverNames} />
            )}

            {projectPath && (
              <ApplyDefaultsButton
                projectPath={projectPath}
                onApplied={loadServers}
              />
            )}
          </>
        )}
      </div>
    </PageShell>
  );
};
