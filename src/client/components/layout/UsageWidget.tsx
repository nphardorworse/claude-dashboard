import { useMemo, useState, useCallback } from "react";
import type { ProjectUsage } from "../../../shared/types";
import { useUsage } from "../../hooks/use-usage";

const MAX_COLLAPSED = 4;

/* ─── Formatters ──────────────────────────────── */

const formatCost = (cost: number): string => {
  if (cost < 0.01 && cost > 0) return "<$0.01";
  if (cost >= 1000) return `$${Math.round(cost)}`;
  if (cost >= 100) return `$${cost.toFixed(0)}`;
  return `$${cost.toFixed(2)}`;
};

const formatTokens = (tokens: number): string => {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
};

/* ─── Project row ─────────────────────────────── */

type ProjectBarProps = {
  project: ProjectUsage;
  isSelected: boolean;
};

const ProjectBar = ({ project, isSelected }: ProjectBarProps) => {
  const barColor = isSelected
    ? "bg-blue-400"
    : "bg-zinc-500";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span
          className={`truncate text-[11px] font-medium ${
            isSelected ? "text-blue-400" : "text-zinc-400"
          }`}
          title={project.path}
        >
          {project.name}
        </span>
        <span className="ml-2 shrink-0 font-mono text-[10px] text-zinc-500">
          {formatCost(project.estimatedCostUSD)}
        </span>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--overlay-subtle)]">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${barColor}`}
          style={{ width: `${Math.max(project.percentage, 2)}%` }}
        />
      </div>
    </div>
  );
};

/* ─── Chevron icon ────────────────────────────── */

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
      expanded ? "rotate-180" : ""
    }`}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/* ─── Widget ──────────────────────────────────── */

type UsageWidgetProps = {
  selectedProjectPath: string | null;
};

export const UsageWidget = ({ selectedProjectPath }: UsageWidgetProps) => {
  const { data, isLoading } = useUsage();
  const [expanded, setExpanded] = useState(false);

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const visibleProjects = useMemo(() => {
    if (!data) return [];
    if (expanded) return data.projects;
    return data.projects.slice(0, MAX_COLLAPSED);
  }, [data, expanded]);

  const hiddenCount = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.projects.length - MAX_COLLAPSED);
  }, [data]);

  const projectBars = useMemo(
    () =>
      visibleProjects.map((project) => (
        <ProjectBar
          key={project.path}
          project={project}
          isSelected={selectedProjectPath === project.path}
        />
      )),
    [visibleProjects, selectedProjectPath]
  );

  const pricingLabel = useMemo(() => {
    if (!data) return "est.";
    return data.pricingBasis === "sonnet" ? "Sonnet est." : "est.";
  }, [data]);

  if (isLoading || !data) return null;
  if (data.projects.length === 0) return null;

  return (
    <div className="border-t border-[var(--border-hairline)] px-5 py-4">
      {/* Header */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
        Plan Usage
      </p>

      {/* Total cost */}
      <div className="mt-2 flex items-baseline justify-between">
        <span className="font-mono text-[15px] font-semibold text-zinc-200">
          {formatCost(data.totalEstimatedCostUSD)}
        </span>
        <span className="text-[10px] text-zinc-600" title="Estimated using Sonnet pricing — Opus sessions may cost more">
          {pricingLabel}
        </span>
      </div>

      {/* Summary line */}
      <p className="mt-0.5 text-[10px] text-zinc-600">
        {data.totalSessions} session{data.totalSessions !== 1 ? "s" : ""}
        {" "}·{" "}
        {data.projects.length} project{data.projects.length !== 1 ? "s" : ""}
        {" "}·{" "}
        {formatTokens(data.totalInputTokens + data.totalOutputTokens)} tokens
      </p>

      {/* Project bars */}
      <div className="mt-3 flex flex-col gap-2.5">
        {projectBars}
      </div>

      {/* Expand/collapse toggle */}
      {hiddenCount > 0 && (
        <button
          onClick={handleToggleExpand}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] text-zinc-600 transition-snappy hover:bg-[var(--overlay-subtle)] hover:text-zinc-400"
        >
          <span>
            {expanded ? "Show less" : `+${hiddenCount} more`}
          </span>
          <ChevronIcon expanded={expanded} />
        </button>
      )}
    </div>
  );
};
