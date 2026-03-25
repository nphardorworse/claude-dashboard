/** Tailwind class for the progress bar fill */
export const getLimitBarColor = (pct: number | null): string => {
  if (pct == null) return "bg-zinc-500";
  if (pct >= 90) return "bg-red-400";
  if (pct >= 70) return "bg-amber-400";
  return "bg-blue-400";
};

/** Tailwind class for percentage/label text */
export const getLimitTextColor = (pct: number | null): string => {
  if (pct == null) return "text-zinc-500";
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-amber-400";
  return "text-zinc-500";
};

/** Tailwind class for card outer glow */
export const getLimitGlow = (pct: number | null): string => {
  if (pct == null) return "";
  if (pct >= 90) return "shadow-[0_0_20px_rgba(239,68,68,0.1)]";
  if (pct >= 70) return "shadow-[0_0_20px_rgba(245,158,11,0.08)]";
  return "";
};
