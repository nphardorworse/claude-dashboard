export const formatCost = (cost: number): string => {
  if (cost < 0.01 && cost > 0) return "<$0.01";
  if (cost >= 1000) return `$${Math.round(cost)}`;
  if (cost >= 100) return `$${cost.toFixed(0)}`;
  return `$${cost.toFixed(2)}`;
};

export const formatTokens = (tokens: number): string => {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
};

export const formatResetTime = (ms: number): string => {
  if (ms <= 0) return "now";
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};
