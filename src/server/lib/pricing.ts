export type ModelPricing = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheWrite1h: number;
  cacheRead: number;
};

// USD per million tokens, Anthropic first-party API standard rates, from
// https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-17).
// cacheWrite is the 5-minute cache write rate, cacheWrite1h the 1-hour one.
const price = (
  input: number, output: number, cacheWrite: number, cacheWrite1h: number, cacheRead: number,
): ModelPricing => ({ input, output, cacheWrite, cacheWrite1h, cacheRead });

const OPUS_4_0 = price(15, 75, 18.75, 30, 1.5);
const OPUS_4_5 = price(5, 25, 6.25, 10, 0.5);
const SONNET_4 = price(3, 15, 3.75, 6, 0.3);
const SONNET_5 = price(2, 10, 2.5, 4, 0.2);
const FABLE_5 = price(10, 50, 12.5, 20, 1);
const FABLE_5_1 = price(10, 50, 12.5, 20, 0.25);
const FABLE_5_2 = price(8, 40, 10, 16, 0.2);

// Keyed by "<family>-<major>.<minor>". Mythos shares Fable's prices.
const MODEL_PRICING: Record<string, ModelPricing> = {
  "fable-5.2": FABLE_5_2,
  "fable-5.1": FABLE_5_1,
  "fable-5.0": FABLE_5,
  "mythos-5.2": FABLE_5_2,
  "mythos-5.1": FABLE_5_1,
  "mythos-5.0": FABLE_5,
  "opus-5.5": price(4, 20, 5, 8, 0.2),
  "opus-5.0": OPUS_4_5,
  "opus-4.8": OPUS_4_5,
  "opus-4.7": OPUS_4_5,
  "opus-4.6": OPUS_4_5,
  "opus-4.5": OPUS_4_5,
  "opus-4.1": OPUS_4_0,
  "opus-4.0": OPUS_4_0,
  "sonnet-5.5": price(2, 10, 2.5, 4, 0.1),
  "sonnet-5.0": SONNET_5,
  "sonnet-4.6": SONNET_4,
  "sonnet-4.5": SONNET_4,
  "sonnet-4.0": SONNET_4,
  // Haiku 5.5 rate for prompts up to 100K tokens; longer prompts cost 5x.
  "haiku-5.5": price(0.1, 0.5, 0.125, 0.2, 0.01),
  "haiku-4.5": price(1, 5, 1.25, 2, 0.1),
};

// A version this table does not list yet (a new release) is priced as the
// newest listed model of its family.
const FAMILY_FALLBACK: Record<string, ModelPricing> = {
  fable: FABLE_5_2,
  mythos: FABLE_5_2,
  opus: MODEL_PRICING["opus-5.5"],
  sonnet: MODEL_PRICING["sonnet-5.5"],
  haiku: MODEL_PRICING["haiku-5.5"],
};

const DEFAULT_PRICING: ModelPricing = SONNET_4;

// Matches claude-opus-4-6, claude-opus-4-5-20251101 and claude-opus-4-20250514
// (an 8-digit date is not a minor version, so that one is Opus 4.0).
const MODEL_ID = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?!\d)/;

export const getPricing = (model: string): ModelPricing => {
  const normalized = model.toLowerCase();
  const id = MODEL_ID.exec(normalized);
  if (id) {
    const [, family, major, minor = "0"] = id;
    const exact = MODEL_PRICING[`${family}-${major}.${minor}`];
    if (exact) return exact;
  }
  // A bare alias ("opus", "sonnet") or an unlisted version of a known family.
  for (const [name, pricing] of Object.entries(FAMILY_FALLBACK)) {
    if (normalized.includes(name)) return pricing;
  }
  return DEFAULT_PRICING;
};

const PER_MILLION = 1_000_000;

/**
 * Tokens of a call's cache writes that went to the 1-hour cache, from a
 * transcript `usage` block. The rest of cache_creation_input_tokens went to
 * the 5-minute cache.
 */
export const oneHourCacheWrites = (
  usage: { cache_creation?: { ephemeral_1h_input_tokens?: number } } | undefined,
): number => usage?.cache_creation?.ephemeral_1h_input_tokens ?? 0;

export type CostBreakdownResult = {
  inputCostUSD: number;
  outputCostUSD: number;
  cacheWriteCostUSD: number;
  cacheReadCostUSD: number;
  totalCostUSD: number;
};

/**
 * `cacheCreation` is all cache-write tokens; `cacheWrite1h` is the part of
 * them written to the 1-hour cache, which costs more than the 5-minute cache.
 */
export const calculateCostBreakdown = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
  cacheWrite1h = 0,
): CostBreakdownResult => {
  const pricing = getPricing(model);
  const oneHour = Math.min(Math.max(cacheWrite1h, 0), cacheCreation);
  const inputCostUSD = (inputTokens / PER_MILLION) * pricing.input;
  const outputCostUSD = (outputTokens / PER_MILLION) * pricing.output;
  const cacheWriteCostUSD =
    ((cacheCreation - oneHour) / PER_MILLION) * pricing.cacheWrite +
    (oneHour / PER_MILLION) * pricing.cacheWrite1h;
  const cacheReadCostUSD = (cacheRead / PER_MILLION) * pricing.cacheRead;
  return {
    inputCostUSD,
    outputCostUSD,
    cacheWriteCostUSD,
    cacheReadCostUSD,
    totalCostUSD: inputCostUSD + outputCostUSD + cacheWriteCostUSD + cacheReadCostUSD,
  };
};

export const calculateTurnCost = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
  cacheWrite1h = 0,
): number =>
  calculateCostBreakdown(model, inputTokens, outputTokens, cacheCreation, cacheRead, cacheWrite1h)
    .totalCostUSD;
