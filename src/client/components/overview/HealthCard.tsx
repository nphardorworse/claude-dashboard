import type { TokenLevel } from "../../../shared/types";

type HealthCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  level?: TokenLevel;
};

const LEVEL_CLASSES: Record<TokenLevel, string> = {
  low: "text-emerald-400",
  medium: "text-amber-400",
  high: "text-red-400",
};

const LEVEL_GLOW: Record<TokenLevel, string> = {
  low: "shadow-[0_0_20px_rgba(16,185,129,0.08)]",
  medium: "shadow-[0_0_20px_rgba(245,158,11,0.08)]",
  high: "shadow-[0_0_20px_rgba(239,68,68,0.1)]",
};

export const HealthCard = ({ title, value, subtitle, level }: HealthCardProps) => {
  const valueColorClass = level ? LEVEL_CLASSES[level] : "text-zinc-50";
  const glowClass = level ? LEVEL_GLOW[level] : "";

  return (
    /* Double-bezel: outer shell */
    <div className={`rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)] ${glowClass}`}>
      {/* Inner core */}
      <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          {title}
        </p>
        <p className={`mt-3 text-2xl font-bold tracking-tight ${valueColorClass}`}>
          {value}
        </p>
        {subtitle && (
          <p className="mt-1.5 text-[11px] text-zinc-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
};
