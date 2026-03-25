import { useCallback } from "react";
import { PageShell } from "../layout/PageShell";
import { useWindowedUsage } from "../../hooks/use-windowed-usage";
import { usePlanLimits } from "../../hooks/use-plan-limits";
import { LimitProgressCard } from "./LimitProgressCard";
import { LimitConfigCard } from "./LimitConfigCard";
import { ProjectBreakdownTable } from "./ProjectBreakdownTable";
import type { PlanLimits } from "../../../shared/types";

type UsagePageProps = {
  projectPath: string | null;
  onClearProject: () => void;
};

export const UsagePage = ({ projectPath: _projectPath, onClearProject: _onClearProject }: UsagePageProps) => {
  const { data, isLoading: usageLoading, refetch } = useWindowedUsage();
  const { limits, saveLimits, isLoading: limitsLoading } = usePlanLimits();

  const handleSaveLimits = useCallback(async (next: PlanLimits) => {
    await saveLimits(next);
    refetch();
  }, [saveLimits, refetch]);

  if (usageLoading || !data) {
    return (
      <PageShell title="Plan Usage">
        <p className="text-[13px] text-zinc-500">Loading usage data...</p>
      </PageShell>
    );
  }

  return (
    <PageShell title="Plan Usage">
      {/* Explanation */}
      <div className="rounded-xl bg-[var(--overlay-faint)] px-4 py-3 ring-1 ring-[var(--border-hairline)]">
        <p className="text-[11px] leading-relaxed text-zinc-500">
          <strong className="text-zinc-400">Why messages, not tokens?</strong>{" "}
          Anthropic rate-limits on messages (user turns), not raw token counts.
          Each prompt you send counts as one message — regardless of how many
          tool calls Claude makes in response. Token totals are shown for context
          but don&apos;t directly determine when you hit the cap.
        </p>
      </div>

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
        Message limits are community estimates — Anthropic does not publish exact numbers.
        Cost estimates use Sonnet pricing. Set reset times from{" "}
        <code className="rounded bg-[var(--overlay-subtle)] px-1 text-zinc-500">/usage</code> for accurate window boundaries.
      </p>
    </PageShell>
  );
};
