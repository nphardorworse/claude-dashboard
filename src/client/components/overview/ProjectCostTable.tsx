import { useState, useEffect, useMemo } from "react";
import type { ProjectInfo } from "../../../shared/types";

const formatCost = (cost: number | null): string => {
  if (cost === null || cost === 0) return "-";
  return `$${cost.toFixed(2)}`;
};

const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "-";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
};

type ProjectRowProps = {
  project: ProjectInfo;
};

const ProjectRow = ({ project }: ProjectRowProps) => {
  const totalOutput = useMemo(
    () => project.modelUsage.reduce((sum, m) => sum + m.outputTokens, 0),
    [project.modelUsage]
  );

  const totalCacheRead = useMemo(
    () => project.modelUsage.reduce((sum, m) => sum + m.cacheReadTokens, 0),
    [project.modelUsage]
  );

  const models = useMemo(
    () =>
      project.modelUsage
        .filter((m) => m.costUSD > 0)
        .sort((a, b) => b.costUSD - a.costUSD)
        .map((m) => {
          const short = m.model
            .replace("claude-", "")
            .replace("[1m]", "")
            .replace("-20251001", "");
          return `${short} $${m.costUSD.toFixed(0)}`;
        })
        .join(", "),
    [project.modelUsage]
  );

  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
      <td className="px-3 py-2.5">
        <span className="text-sm font-medium text-zinc-200">{project.name}</span>
        <span className="ml-2 font-mono text-xs text-zinc-600" title={project.path}>
          {project.path.replace(/^\/Users\/[^/]+\//, "~/")}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-sm text-zinc-300">
        {formatCost(project.totalCostUSD)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-400">
        {formatTokens(totalOutput)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-400">
        {formatTokens(totalCacheRead)}
      </td>
      <td className="hidden px-3 py-2.5 text-xs text-zinc-500 xl:table-cell">
        {models || "-"}
      </td>
    </tr>
  );
};

export const ProjectCostTable = () => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const data = await res.json();
        setProjects(data.projects ?? []);
      } catch {
        // Silent fail — overview still works without this
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const sorted = useMemo(
    () =>
      [...projects]
        .filter((p) => (p.totalCostUSD ?? 0) > 0)
        .sort((a, b) => (b.totalCostUSD ?? 0) - (a.totalCostUSD ?? 0)),
    [projects]
  );

  const totalCost = useMemo(
    () => sorted.reduce((sum, p) => sum + (p.totalCostUSD ?? 0), 0),
    [sorted]
  );

  if (isLoading) return null;
  if (sorted.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">
          Cost by Project
        </h3>
        <span className="font-mono text-sm font-medium text-zinc-300">
          Total: ${totalCost.toFixed(2)}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Cumulative costs per project directory from Claude Code usage data
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-zinc-700">
              <th className="px-3 py-2 text-xs font-medium text-zinc-500">
                Project
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">
                Cost
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">
                Output
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">
                Cache Read
              </th>
              <th className="hidden px-3 py-2 text-xs font-medium text-zinc-500 xl:table-cell">
                Models
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((project) => (
              <ProjectRow key={project.path} project={project} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
