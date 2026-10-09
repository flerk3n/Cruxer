/**
 * Single source of truth for plan limits. Tune pricing here only.
 *
 * Cost model (2026 list prices, worst case): a kit costs ~$0.10 in Gemini Flash-Lite
 * and Tavily calls; one live-mock minute costs ~$0.10 (ElevenLabs Agents + LLM +
 * scoring). Pro at $9 nets ~$8.06 after Dodo's worst-case fees, so a subscriber who
 * exhausts every limit (25 kits + 30 minutes = ~$5.50) still leaves a positive margin.
 */
export type PlanId = "free" | "pro";

export interface PlanLimits {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  kitsPerPeriod: number;
  mockSecondsPerPeriod: number;
  /** Ceiling for one voice session; also configure it as the ElevenLabs agent max duration. */
  maxMockSessionSeconds: number;
  /** Fair-use cap per kit: each regeneration re-runs the whole pipeline. */
  regenerationsPerKit: number;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: "free",
    name: "Free",
    priceUsdMonthly: 0,
    kitsPerPeriod: 5,
    mockSecondsPerPeriod: 0,
    maxMockSessionSeconds: 0,
    regenerationsPerKit: 3
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsdMonthly: 9,
    kitsPerPeriod: 25,
    mockSecondsPerPeriod: 30 * 60,
    maxMockSessionSeconds: 10 * 60,
    regenerationsPerKit: 10
  }
};

/** A mock is not started with less time than this left in the period. */
export const MIN_MOCK_START_SECONDS = 60;

/** A cancelled or past-due subscription keeps access for this long after its period end. */
export const PRO_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
