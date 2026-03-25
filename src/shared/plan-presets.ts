/**
 * Approximate message limits per plan tier.
 *
 * Anthropic rate-limits on **messages** (user turns/prompts), not raw tokens.
 * Each prompt you send = 1 message, regardless of how many tool calls
 * Claude makes in response. These community-estimated values are per
 * 5-hour rolling window.
 *
 * Sources:
 * - https://intuitionlabs.ai/articles/claude-max-plan-pricing-usage-limits
 * - https://www.faros.ai/blog/claude-code-token-limits
 * - https://www.truefoundry.com/blog/claude-code-limits-explained
 * - https://portkey.ai/blog/claude-code-limits/
 */

export type PlanPreset = {
  id: string;
  label: string;
  price: string;
  sessionMessageLimit: number;
  multiplier: string;
  claudeCodeAccess: boolean;
};

export const PLAN_PRESETS: PlanPreset[] = [
  {
    id: "free",
    label: "Free",
    price: "$0/mo",
    sessionMessageLimit: 30,
    multiplier: "1x",
    claudeCodeAccess: false,
  },
  {
    id: "pro",
    label: "Pro",
    price: "$20/mo",
    sessionMessageLimit: 45,
    multiplier: "~5x Free",
    claudeCodeAccess: true,
  },
  {
    id: "max_5x",
    label: "Max 5x",
    price: "$100/mo",
    sessionMessageLimit: 225,
    multiplier: "5x Pro",
    claudeCodeAccess: true,
  },
  {
    id: "max_20x",
    label: "Max 20x",
    price: "$200/mo",
    sessionMessageLimit: 900,
    multiplier: "20x Pro",
    claudeCodeAccess: true,
  },
];

export const getPresetById = (id: string): PlanPreset | undefined =>
  PLAN_PRESETS.find((p) => p.id === id);

export const DEFAULT_PRESET_ID = "max_5x";
