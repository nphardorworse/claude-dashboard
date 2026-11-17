import { test } from "node:test";
import assert from "node:assert/strict";
import { getPricing, calculateTurnCost, oneHourCacheWrites } from "./pricing";

// [input, output, 5m cache write, 1h cache write, cache read] in USD per million tokens, from
// https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-17).
const expected: Record<string, [number, number, number, number, number]> = {
  // Every model id found in ~/.claude/projects transcripts.
  "claude-opus-5-5": [4, 20, 5, 8, 0.2],
  "claude-opus-5": [5, 25, 6.25, 10, 0.5],
  "claude-opus-4-8": [5, 25, 6.25, 10, 0.5],
  "claude-fable-5-2": [8, 40, 10, 16, 0.2],
  "claude-fable-5-1": [10, 50, 12.5, 20, 0.25],
  "claude-fable-5": [10, 50, 12.5, 20, 1],
  "claude-sonnet-5-5": [2, 10, 2.5, 4, 0.1],
  "claude-sonnet-5": [2, 10, 2.5, 4, 0.2],
  "claude-sonnet-4-6": [3, 15, 3.75, 6, 0.3],
  "claude-haiku-5-5": [0.1, 0.5, 0.125, 0.2, 0.01],
  "claude-haiku-4-5-20251001": [1, 5, 1.25, 2, 0.1],
  // Dated ids: the 8-digit date must not be read as a minor version.
  "claude-opus-4-20250514": [15, 75, 18.75, 30, 1.5],
  "claude-opus-4-1-20250805": [15, 75, 18.75, 30, 1.5],
  "claude-opus-4-5-20251101": [5, 25, 6.25, 10, 0.5],
  "claude-sonnet-4-20250514": [3, 15, 3.75, 6, 0.3],
  // Context-window suffix.
  "claude-opus-4-6[1m]": [5, 25, 6.25, 10, 0.5],
  "claude-mythos-5-2": [8, 40, 10, 16, 0.2],
};

for (const [model, [input, output, cacheWrite, cacheWrite1h, cacheRead]] of Object.entries(expected)) {
  test(`prices ${model}`, () => {
    assert.deepEqual(getPricing(model), { input, output, cacheWrite, cacheWrite1h, cacheRead });
  });
}

test("an unlisted version of a known family gets that family's newest price", () => {
  assert.deepEqual(getPricing("claude-opus-9-9"), getPricing("claude-opus-5-5"));
  assert.deepEqual(getPricing("sonnet"), getPricing("claude-sonnet-5-5"));
});

test("an unknown model gets the default price", () => {
  assert.deepEqual(getPricing("<synthetic>"), { input: 3, output: 15, cacheWrite: 3.75, cacheWrite1h: 6, cacheRead: 0.3 });
});

test("calculateTurnCost applies each token type's rate", () => {
  // Opus 5.5: 1M of each token type.
  const cost = calculateTurnCost("claude-opus-5-5", 1e6, 1e6, 1e6, 1e6);
  assert.equal(cost, 4 + 20 + 5 + 0.2);
});

test("1-hour cache writes are billed at the 1-hour rate, the rest at the 5-minute rate", () => {
  // Opus 5.5: 3M cache-write tokens, 1M of them to the 1-hour cache.
  assert.equal(calculateTurnCost("claude-opus-5-5", 0, 0, 3e6, 0, 1e6), 2 * 5 + 8);
  // Without the split every write is a 5-minute write.
  assert.equal(calculateTurnCost("claude-opus-5-5", 0, 0, 3e6, 0), 3 * 5);
});

test("oneHourCacheWrites reads the transcript usage split", () => {
  const usage = {
    cache_creation_input_tokens: 300,
    cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
  };
  assert.equal(oneHourCacheWrites(usage), 200);
  assert.equal(oneHourCacheWrites({}), 0);
  assert.equal(oneHourCacheWrites(undefined), 0);
});
