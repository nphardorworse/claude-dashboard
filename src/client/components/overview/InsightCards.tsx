import type { Insight } from "../../../shared/types";

type InsightCardsProps = {
  insights: Insight[];
};

const LEVEL_CONFIG: Record<
  Insight["level"],
  { iconBg: string; iconColor: string; borderColor: string; icon: string }
> = {
  info: {
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    borderColor: "ring-blue-500/10",
    icon: "\u2139",
  },
  warning: {
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    borderColor: "ring-amber-500/10",
    icon: "\u26A0",
  },
  tip: {
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    borderColor: "ring-emerald-500/10",
    icon: "\u2728",
  },
};

type InsightCardProps = {
  insight: Insight;
};

const InsightCard = ({ insight }: InsightCardProps) => {
  const config = LEVEL_CONFIG[insight.level];

  return (
    <div className={`rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ${config.borderColor}`}>
      <div className="flex gap-3 rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-4 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.iconBg}`}
        >
          <span className={`text-sm ${config.iconColor}`}>{config.icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-200">{insight.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            {insight.message}
          </p>
        </div>
      </div>
    </div>
  );
};

export const InsightCards = ({ insights }: InsightCardsProps) => {
  if (insights.length === 0) return null;

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold text-zinc-300">Insights</h4>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
};
