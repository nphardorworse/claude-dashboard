type BadgeVariant = "low" | "medium" | "high" | "info";

type BadgeProps = {
  label: string;
  variant: BadgeVariant;
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  low: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  high: "bg-red-500/10 text-red-400 ring-red-500/20",
  info: "bg-[var(--overlay-subtle)] text-zinc-300 ring-[var(--border-accent)]",
};

export const Badge = ({ label, variant }: BadgeProps) => {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide ring-1 ring-inset ${VARIANT_CLASSES[variant]}`}
    >
      {label}
    </span>
  );
};
