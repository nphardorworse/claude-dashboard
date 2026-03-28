import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { PageShell } from "../layout/PageShell";
import { useWindowedUsage } from "../../hooks/use-windowed-usage";
import { usePlanLimits } from "../../hooks/use-plan-limits";
import { LimitProgressCard } from "./LimitProgressCard";
import { LimitConfigCard } from "./LimitConfigCard";
import { ProjectBreakdownTable } from "./ProjectBreakdownTable";
import type { PlanLimits, ContextWindowResponse } from "../../../shared/types";

type UsagePageProps = {
  projectPath: string | null;
  onClearProject: () => void;
};

export const UsagePage = ({
  projectPath: _projectPath,
  onClearProject: _onClearProject,
}: UsagePageProps) => {
  const { data, isLoading: usageLoading, refetch } = useWindowedUsage();
  const { limits, saveLimits, isLoading: limitsLoading } = usePlanLimits();
  const [contextWindow, setContextWindow] =
    useState<ContextWindowResponse | null>(null);

  useEffect(() => {
    fetch("http://localhost:3847/api/defaults/context-window")
      .then((r) => r.json())
      .then(setContextWindow)
      .catch(() => {});
  }, []);

  const handleSaveLimits = useCallback(
    async (next: PlanLimits) => {
      await saveLimits(next);
      refetch();
    },
    [saveLimits, refetch],
  );

  const handleSaveContextWindow = useCallback(async (size: number | null) => {
    await apiFetch("http://localhost:3847/api/defaults/context-window", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contextWindowSize: size }),
    });
    const res = await fetch(
      "http://localhost:3847/api/defaults/context-window",
    );
    setContextWindow(await res.json());
  }, []);

  if (usageLoading || !data) {
    return (
      <PageShell title="Plan Usage">
        <p className="text-[13px] text-zinc-500">Loading usage data...</p>
      </PageShell>
    );
  }

  return (
    <PageShell title="Plan Usage">
      {/* Progress cards — session + weekly */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LimitProgressCard
          title="Session (5hr window)"
          messages={data.session.totalMessages}
          messageLimit={data.session.messageLimit}
          messagePercentage={data.session.messagePercentage}
          outputTokens={data.session.totalOutputTokens}
          inputTokens={data.session.totalInputTokens}
          totalSessions={data.session.totalSessions}
          resetsInMs={data.session.resetsInMs}
        />
        <LimitProgressCard
          title="Weekly (7-day window)"
          messages={data.weekly.totalMessages}
          messageLimit={data.weekly.messageLimit}
          messagePercentage={data.weekly.messagePercentage}
          outputTokens={data.weekly.totalOutputTokens}
          inputTokens={data.weekly.totalInputTokens}
          totalSessions={data.weekly.totalSessions}
          resetsInMs={data.weekly.resetsInMs}
        />
      </div>

      {/* Configure limits */}
      <div className="mt-6">
        <LimitConfigCard
          limits={limits}
          isLoading={limitsLoading}
          onSave={handleSaveLimits}
          contextWindow={contextWindow}
          onSaveContextWindow={handleSaveContextWindow}
        />
      </div>

      {/* Per-project breakdown table */}
      <div className="mt-6">
        <ProjectBreakdownTable
          sessionProjects={data.session.projects}
          weeklyProjects={data.weekly.projects}
        />
      </div>

      {/* Pricing disclaimer */}
      <p className="mt-4 text-[10px] text-zinc-500">
        Message limits are community estimates — Anthropic does not publish
        exact numbers. Cost estimates use Sonnet pricing. Set reset times from{" "}
        <code className="rounded bg-[var(--overlay-subtle)] px-1 text-zinc-500">
          /usage
        </code>{" "}
        for accurate window boundaries.
      </p>
    </PageShell>
  );
};
