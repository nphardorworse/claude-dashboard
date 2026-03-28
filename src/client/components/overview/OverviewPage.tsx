import { useMemo, useState, useCallback } from "react";
import { PageShell } from "../layout/PageShell";
import { useHealth } from "../../hooks/use-health";
import { HealthCard } from "./HealthCard";
import { CostEstimator } from "./CostEstimator";
import { WarningsList } from "./WarningsList";
import { ProjectCostTable } from "./ProjectCostTable";
import { SessionHistory } from "./SessionHistory";
import { ProjectAnalytics } from "./ProjectAnalytics";
import { LocalOverrides } from "./LocalOverrides";
import { getProjectDisplayName } from "../../lib/api";
import { XIcon } from "../shared/NavIcons";

type OverviewPageProps = {
  projectPath?: string | null;
  onClearProject?: () => void;
  onSelectProject?: (path: string) => void;
};

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1000) {
    return `~${Math.round(tokens / 1000)}k`;
  }
  return `~${tokens}`;
};

const LoadingState = () => {
  return (
    <div className="flex items-center gap-2 py-12 text-zinc-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      <span className="text-sm">Loading health data...</span>
    </div>
  );
};

const ErrorState = ({ message }: { message: string }) => {
  return (
    <div className="rounded-lg bg-red-500/10 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)]">
      <p className="text-sm text-red-400">
        Failed to load health data: {message}
      </p>
    </div>
  );
};

type ScopeBannerProps = {
  projectName: string;
  onClear?: () => void;
};

const ScopeBanner = ({ projectName, onClear }: ScopeBannerProps) => (
  <div className="flex items-center rounded-lg bg-blue-500/10 px-4 py-2.5 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]">
    <p className="flex-1 text-sm text-blue-300">
      Scoped to <span className="font-semibold">{projectName}</span>
    </p>
    {onClear && (
      <button
        onClick={onClear}
        className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-blue-400/60 transition-snappy hover:bg-blue-400/10 hover:text-blue-300 active:scale-[0.96] before:absolute before:-inset-2.5 before:content-['']"
        title="Return to global view"
      >
        <XIcon size={12} />
      </button>
    )}
  </div>
);

export const OverviewPage = ({ projectPath, onClearProject, onSelectProject }: OverviewPageProps) => {
  const { data, isLoading, error } = useHealth(projectPath);
  const isScoped = !!projectPath;
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);

  const handleExpensiveSessionClick = useCallback((sessionId: string) => {
    setFocusSessionId(sessionId);
  }, []);
  const projectName = useMemo(
    () => getProjectDisplayName(projectPath ?? null),
    [projectPath]
  );

  const tokenSubtitle = useMemo(() => {
    if (!data) return undefined;
    const { tokenBudgetLevel } = data.summary;
    if (tokenBudgetLevel === "low") return "Within budget";
    if (tokenBudgetLevel === "medium") return "Moderate usage";
    return "Over budget - consider disabling plugins";
  }, [data]);

  const hookSubtitle = useMemo(() => {
    if (!data) return undefined;
    const { totalHookCommands } = data.summary;
    return `${totalHookCommands} command${totalHookCommands === 1 ? "" : "s"} total`;
  }, [data]);

  const pluginSubtitle = useMemo(() => {
    if (!data) return undefined;
    const { activePlugins, totalPlugins } = data.summary;
    return `${activePlugins} of ${totalPlugins} enabled`;
  }, [data]);

  const _profileSubtitle = useMemo(() => {
    if (!data) return undefined;
    return data.summary.activeProfile ?? "No matching profile";
  }, [data]);

  return (
    <PageShell title="Overview">
      <div className="flex flex-col gap-6">
        {isScoped && projectName && <ScopeBanner projectName={projectName} onClear={onClearProject} />}

        {isLoading && <LoadingState />}

        {error && <ErrorState message={error} />}

        {!isLoading && !error && data && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <HealthCard
                title="Plugins"
                value={data.summary.activePlugins}
                subtitle={pluginSubtitle}
              />
              <HealthCard
                title="MCP Servers"
                value={data.summary.activeMcpServers}
                subtitle="Configured in ~/.claude.json"
              />
              <HealthCard
                title="Hook Events"
                value={data.summary.hookEventCount}
                subtitle={hookSubtitle}
              />
              <HealthCard
                title="Est. Tokens/Turn"
                value={formatTokenCount(data.summary.estimatedTokensPerTurn)}
                subtitle={tokenSubtitle}
                level={data.summary.tokenBudgetLevel}
              />
            </div>

            <CostEstimator plugins={data.topPluginsByCost} contextWindowSize={data.summary.contextWindowSize} />

            {isScoped && projectPath && (
              <ProjectAnalytics
                projectPath={projectPath}
                onSessionClick={handleExpensiveSessionClick}
              />
            )}

            {isScoped && projectPath ? (
              <SessionHistory
                projectPath={projectPath}
                focusSessionId={focusSessionId}
              />
            ) : (
              <ProjectCostTable onSelectProject={onSelectProject} />
            )}

            <LocalOverrides />

            <WarningsList warnings={data.warnings} />
          </>
        )}
      </div>
    </PageShell>
  );
};
