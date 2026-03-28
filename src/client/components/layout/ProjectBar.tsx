import { formatCost } from "../../lib/format";

type ProjectBarProps = {
  name: string;
  path: string;
  estimatedCostUSD: number;
  percentage: number;
  isSelected: boolean;
};

export const ProjectBar = ({ name, path, estimatedCostUSD, percentage, isSelected }: ProjectBarProps) => {
  const barColor = isSelected ? "bg-blue-400" : "bg-zinc-500";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span
          className={`truncate text-[11px] font-medium ${
            isSelected ? "text-blue-400" : "text-zinc-400"
          }`}
          title={path}
        >
          {name}
        </span>
        <span className="ml-2 shrink-0 font-mono text-[10px] text-zinc-500">
          {formatCost(estimatedCostUSD)}
        </span>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--overlay-subtle)]">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${barColor}`}
          style={{ width: `${Math.min(Math.max(percentage, 2), 100)}%` }}
        />
      </div>
    </div>
  );
};
