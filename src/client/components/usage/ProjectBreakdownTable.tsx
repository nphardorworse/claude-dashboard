import { useMemo, useState, useCallback } from "react";
import type { WindowedProjectUsage } from "../../../shared/types";
import { formatTokens, formatCost } from "../../lib/format";

type ProjectBreakdownTableProps = {
  sessionProjects: WindowedProjectUsage[];
  weeklyProjects: WindowedProjectUsage[];
};

type TabId = "weekly" | "session";

/* ─── Tab selector ──────────────────────────── */

type TabButtonProps = {
  label: string;
  isActive: boolean;
  onClick: () => void;
};

const TabButton = ({ label, isActive, onClick }: TabButtonProps) => (
  <button
    onClick={onClick}
    className={`rounded-md px-3 py-1 text-[11px] font-medium transition-snappy ${
      isActive
        ? "bg-[var(--overlay-medium)] text-zinc-200"
        : "text-zinc-500 hover:text-zinc-300"
    }`}
  >
    {label}
  </button>
);

/* ─── Table row ─────────────────────────────── */

type ProjectRowProps = {
  project: WindowedProjectUsage;
};

const ProjectRow = ({ project }: ProjectRowProps) => (
  <tr className="border-b border-[var(--border-hairline)] transition-snappy hover:bg-[var(--overlay-faint)]">
    <td className="py-2.5 pr-3 text-[12px] font-medium text-zinc-300" title={project.path}>
      {project.name}
    </td>
    <td className="py-2.5 pr-3 text-right font-mono text-[11px] font-medium text-zinc-200">
      {project.messages}
    </td>
    <td className="py-2.5 pr-3 text-right font-mono text-[11px] text-zinc-400">
      {formatTokens(project.outputTokens)}
    </td>
    <td className="py-2.5 pr-3 text-right font-mono text-[11px] text-zinc-400">
      {formatTokens(project.inputTokens)}
    </td>
    <td className="py-2.5 text-right font-mono text-[11px] text-zinc-500">
      {formatCost(project.estimatedCostUSD)}
    </td>
  </tr>
);

/* ─── Table ─────────────────────────────────── */

export const ProjectBreakdownTable = ({ sessionProjects, weeklyProjects }: ProjectBreakdownTableProps) => {
  const [activeTab, setActiveTab] = useState<TabId>("weekly");

  const handleWeeklyTab = useCallback(() => setActiveTab("weekly"), []);
  const handleSessionTab = useCallback(() => setActiveTab("session"), []);

  const projects = activeTab === "weekly" ? weeklyProjects : sessionProjects;

  const rows = useMemo(
    () => projects.map((p) => <ProjectRow key={p.path} project={p} />),
    [projects]
  );

  return (
    <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
      <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
            Per-project breakdown
          </p>
          <div className="flex gap-1 rounded-lg bg-[var(--overlay-faint)] p-0.5">
            <TabButton label="Weekly (7d)" isActive={activeTab === "weekly"} onClick={handleWeeklyTab} />
            <TabButton label="Session (5hr)" isActive={activeTab === "session"} onClick={handleSessionTab} />
          </div>
        </div>

        {/* Table */}
        {projects.length === 0 ? (
          <p className="mt-6 text-center text-[12px] text-zinc-500">
            No activity in this window
          </p>
        ) : (
          <table className="mt-4 w-full">
            <thead>
              <tr className="border-b border-[var(--border-accent)]">
                <th className="pb-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Project
                </th>
                <th className="pb-2 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Msgs
                </th>
                <th className="pb-2 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Output
                </th>
                <th className="pb-2 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Input
                </th>
                <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        )}
      </div>
    </div>
  );
};
