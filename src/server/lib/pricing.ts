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
  // For prompts up to 100K tokens; see LONG_PROMPT_PRICING.
  "haiku-5.5": price(0.1, 0.5, 0.125, 0.2, 0.01),
  "haiku-4.5": price(1, 5, 1.25, 2, 0.1),
  // Retired Claude 3 models, kept so old transcripts are priced right.
  "opus-3.0": OPUS_4_0,
  "sonnet-3.7": SONNET_4,
  "sonnet-3.5": SONNET_4,
  "sonnet-3.0": SONNET_4,
  "haiku-3.5": price(0.8, 4, 1, 1.6, 0.08),
  "haiku-3.0": price(0.25, 1.25, 0.3, 0.5, 0.03),
};

// Models whose whole request is billed at higher rates when its prompt (input
// plus cache writes plus cache reads) is over a token threshold.
const LONG_PROMPT_PRICING: Record<string, { overTokens: number; pricing: ModelPricing }> = {
  "haiku-5.5": { overTokens: 100_000, pricing: price(0.5, 2.5, 0.625, 1, 0.05) },
};

const DEFAULT_PRICING: ModelPricing = SONNET_4;

const FAMILIES = ["fable", "mythos", "opus", "sonnet", "haiku"] as const;

// Matches claude-opus-4-6, claude-opus-4-5-20251101 and claude-opus-4-20250514
// (an 8-digit date is not a minor version, so that one is Opus 4.0).
const MODEL_ID = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?!\d)/;
// Claude 3 ids put the version first: claude-3-5-haiku-20241022, claude-3-opus.
const LEGACY_MODEL_ID = /claude-(\d)(?:-(\d))?-(opus|sonnet|haiku)/;

// A version as one comparable number: 4.10 -> 410, which sorts above 4.9 -> 409
// (as a decimal, 4.10 would equal 4.1).
const versionRank = (major: number, minor: number): number => major * 100 + minor;

// Listed table keys per family, newest first, with their rank.
const LISTED_VERSIONS = new Map<string, { key: string; rank: number }[]>(
  FAMILIES.map((family) => [
    family,
    Object.keys(MODEL_PRICING)
      .filter((key) => key.startsWith(`${family}-`))
      .map((key) => {
        const [major, minor] = key.slice(family.length + 1).split(".").map(Number);
        return { key, rank: versionRank(major, minor) };
      })
      .sort((a, b) => b.rank - a.rank),
  ]),
);

/**
 * The table key for a model id. An unlisted version gets the nearest listed
 * version of its family at or below it (a new release above every listed
 * version therefore gets the newest price), or the oldest listed version when
 * it is older than all of them. A bare alias ("opus") gets the newest.
 */
const pricingKey = (model: string): string | undefined => {
  const normalized = model.toLowerCase();
  const legacy = LEGACY_MODEL_ID.exec(normalized);
  const id = legacy
    ? { family: legacy[3], major: legacy[1], minor: legacy[2] ?? "0" }
    : (() => {
        const m = MODEL_ID.exec(normalized);
        return m ? { family: m[1], major: m[2], minor: m[3] ?? "0" } : undefined;
      })();

  const family = id?.family ?? FAMILIES.find((f) => normalized.includes(f));
  if (!family) return undefined;
  const listed = LISTED_VERSIONS.get(family) ?? [];
  if (listed.length === 0) return undefined;
  if (!id) return listed[0].key;

  const rank = versionRank(Number(id.major), Number(id.minor));
  return (listed.find((v) => v.rank <= rank) ?? listed[listed.length - 1]).key;
};

/**
 * Rates for one API call. `promptTokens` (input + cache writes + cache reads
 * of that call) picks the long-prompt tier on models that have one; leave it
 * out for the standard rates.
 */
export const getPricing = (model: string, promptTokens = 0): ModelPricing => {
  const key = pricingKey(model);
  if (!key) return DEFAULT_PRICING;
  const longPrompt = LONG_PROMPT_PRICING[key];
  if (longPrompt && promptTokens > longPrompt.overTokens) return longPrompt.pricing;
  return MODEL_PRICING[key];
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
 * Cost of ONE API call: the token counts pick its long-prompt tier, so never
 * pass usage summed over several calls. `cacheCreation` is all cache-write
 * tokens; `cacheWrite1h` is the part of them written to the 1-hour cache,
 * which costs more than the 5-minute cache.
 */
export const calculateCostBreakdown = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
  cacheWrite1h = 0,
): CostBreakdownResult => {
  const pricing = getPricing(model, inputTokens + cacheCreation + cacheRead);
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

/**
 * Estimate for usage already summed over many calls, where the per-call
 * long-prompt tier and the 1-hour cache split are unknown: standard rates,
 * every cache write priced as a 5-minute write.
 */
export const calculateSummedCost = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
): number => {
  const pricing = getPricing(model);
  return (
    inputTokens * pricing.input +
    outputTokens * pricing.output +
    cacheCreation * pricing.cacheWrite +
    cacheRead * pricing.cacheRead
  ) / PER_MILLION;
};
