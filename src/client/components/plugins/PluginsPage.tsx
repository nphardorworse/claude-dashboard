import { useState, useEffect, useCallback, useMemo } from "react";
import type { PluginInfo, PluginsResponse } from "../../../shared/types";
import { apiFetch, buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { PageShell } from "../layout/PageShell";
import { ScopeBanner } from "../shared/ScopeBanner";
import { CategoryFilter } from "./CategoryFilter";
import { PluginGrid } from "./PluginGrid";
import { Input } from "~/client/components/ui/input";

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return String(tokens);
};

const SummaryBar = ({
  activeCount,
  totalCount,
  totalEstimatedTokens,
}: {
  activeCount: number;
  totalCount: number;
  totalEstimatedTokens: number;
}) => {
  return (
    <div className="rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--border-hairline)] px-5 py-3.5">
        <p className="text-sm text-zinc-300">
          <span className="font-semibold tabular-nums text-zinc-100">{activeCount}</span>
          {" of "}
          <span className="font-semibold tabular-nums text-zinc-100">{totalCount}</span>
          {" plugins active"}
          <span className="mx-2 text-zinc-500">|</span>
          <span className="text-zinc-400">
            ~{formatTokenCount(totalEstimatedTokens)} tokens/turn
          </span>
        </p>
    </div>
  );
};

type StatusFilterOption = "all" | "active" | "inactive";

type StatusFilterProps = {
  active: StatusFilterOption;
  onChange: (value: StatusFilterOption) => void;
};

const STATUS_OPTIONS: { value: StatusFilterOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const StatusFilter = ({ active, onChange }: StatusFilterProps) => {
  return (
    <div className="flex h-9 rounded-lg ring-1 ring-[var(--border-accent)] bg-[var(--surface-raised)]">
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 text-xs font-medium transition-colors active:scale-[0.96] ${
            active === opt.value
              ? "bg-[var(--overlay-medium)] text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          } ${opt.value === "all" ? "rounded-l-lg" : ""} ${opt.value === "inactive" ? "rounded-r-lg" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

const LoadingState = () => {
  return (
    <div className="flex items-center gap-2 py-12 text-zinc-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      <span className="text-sm">Loading plugins...</span>
    </div>
  );
};

const ErrorState = ({ message }: { message: string }) => {
  return (
    <div className="rounded-lg bg-red-500/10 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)]">
      <p className="text-sm text-red-400">Failed to load plugins: {message}</p>
    </div>
  );
};

const fetchPlugins = async (
  projectPath: string | null
): Promise<PluginsResponse> => {
  const url = buildScopedUrl("/api/plugins", projectPath);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
};

const togglePlugin = async (
  pluginId: string,
  enabled: boolean,
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl("/api/plugins/toggle", projectPath);
  const response = await apiFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pluginId, enabled }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
};

type PluginsPageProps = {
  projectPath?: string | null;
  onClearProject?: () => void;
};

export const PluginsPage = ({ projectPath = null, onClearProject }: PluginsPageProps) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [totalEstimatedTokens, setTotalEstimatedTokens] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const loadPlugins = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await fetchPlugins(projectPath);
      setPlugins(data.plugins);
      setActiveCount(data.activeCount);
      setTotalEstimatedTokens(data.totalEstimatedTokens);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadPlugins(true);
  }, [loadPlugins]);

  const handleToggle = useCallback(
    async (pluginId: string, enabled: boolean) => {
      setTogglingIds((prev) => new Set([...prev, pluginId]));

      // Optimistic update — toggle locally, no full refetch
      setPlugins((prev) => {
        const plugin = prev.find((p) => p.id === pluginId);
        const tokenDelta = plugin ? (enabled ? plugin.estimatedTokens : -plugin.estimatedTokens) : 0;
        setActiveCount((c) => c + (enabled ? 1 : -1));
        setTotalEstimatedTokens((t) => t + tokenDelta);

        return prev.map((p) =>
          p.id === pluginId
            ? { ...p, enabled, enableSource: "project" as const }
            : p
        );
      });

      try {
        await togglePlugin(pluginId, enabled, projectPath);
      } catch (err) {
        console.error("Toggle failed:", err);
        await loadPlugins(false);
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });
      }
    },
    [projectPath, loadPlugins]
  );

  const categories = useMemo(() => {
    const marketplaces = new Set(plugins.map((p) => p.marketplace));
    return Array.from(marketplaces).sort().map((m) => ({ value: m, label: m }));
  }, [plugins]);

  const filteredPlugins = useMemo(() => {
    let result = plugins;

    if (activeCategory !== "All") {
      result = result.filter((p) => p.marketplace === activeCategory);
    }

    if (statusFilter === "active") {
      result = result.filter((p) => p.enabled);
    } else if (statusFilter === "inactive") {
      result = result.filter((p) => !p.enabled);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [plugins, activeCategory, statusFilter, searchQuery]);

  const pageTitle = projectPath
    ? `Plugins (${getProjectDisplayName(projectPath)})`
    : "Plugins";

  return (
    <PageShell title={pageTitle}>
      <div className="flex flex-col gap-4">
        <ScopeBanner projectPath={projectPath} configType="plugins" onClear={onClearProject} />

        {isLoading && <LoadingState />}

        {error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <>
            <SummaryBar
              activeCount={activeCount}
              totalCount={plugins.length}
              totalEstimatedTokens={totalEstimatedTokens}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plugins..."
                className="flex-1"
              />
              <StatusFilter active={statusFilter} onChange={setStatusFilter} />
            </div>

            {categories.length > 1 && (
              <CategoryFilter
                categories={categories}
                active={activeCategory}
                onChange={setActiveCategory}
              />
            )}

            <PluginGrid
              plugins={filteredPlugins}
              onToggle={handleToggle}
              togglingIds={togglingIds}
            />
          </>
        )}
      </div>
    </PageShell>
  );
};
