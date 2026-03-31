export type ModelPricing = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

const PRICING_TABLE: { pattern: string; pricing: ModelPricing }[] = [
  {
    pattern: "opus",
    pricing: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  },
  {
    pattern: "sonnet",
    pricing: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  },
  {
    pattern: "haiku-4",
    pricing: { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 },
  },
  {
    pattern: "haiku-3",
    pricing: { input: 0.25, output: 1.25, cacheWrite: 0.3, cacheRead: 0.03 },
  },
  {
    pattern: "haiku",
    pricing: { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 },
  },
];

const DEFAULT_PRICING: ModelPricing = {
  input: 3,
  output: 15,
  cacheWrite: 3.75,
  cacheRead: 0.3,
};

export const getPricing = (model: string): ModelPricing => {
  const normalized = model.toLowerCase();
  for (const entry of PRICING_TABLE) {
    if (normalized.includes(entry.pattern)) {
      return entry.pricing;
    }
  }
  return DEFAULT_PRICING;
};

const PER_MILLION = 1_000_000;

export const calculateTurnCost = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number
): number => {
  const pricing = getPricing(model);
  return (
    (inputTokens / PER_MILLION) * pricing.input +
    (outputTokens / PER_MILLION) * pricing.output +
    (cacheCreation / PER_MILLION) * pricing.cacheWrite +
    (cacheRead / PER_MILLION) * pricing.cacheRead
  );
};

export type CostBreakdownResult = {
  inputCostUSD: number;
  outputCostUSD: number;
  cacheWriteCostUSD: number;
  cacheReadCostUSD: number;
  totalCostUSD: number;
};

export const calculateCostBreakdown = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number
): CostBreakdownResult => {
  const pricing = getPricing(model);
  const inputCostUSD = (inputTokens / PER_MILLION) * pricing.input;
  const outputCostUSD = (outputTokens / PER_MILLION) * pricing.output;
  const cacheWriteCostUSD = (cacheCreation / PER_MILLION) * pricing.cacheWrite;
  const cacheReadCostUSD = (cacheRead / PER_MILLION) * pricing.cacheRead;
  return {
    inputCostUSD,
    outputCostUSD,
    cacheWriteCostUSD,
    cacheReadCostUSD,
    totalCostUSD: inputCostUSD + outputCostUSD + cacheWriteCostUSD + cacheReadCostUSD,
  };
};
