import type { TokenLevel } from "../../shared/types";

export const estimateTokens = (bytes: number): number => {
  return Math.ceil(bytes / 3.5);
};

export const getTokenLevel = (tokens: number): TokenLevel => {
  if (tokens < 5000) return "low";
  if (tokens <= 50000) return "medium";
  return "high";
};
