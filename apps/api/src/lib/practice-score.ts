export type PracticeConfidence = 1 | 2 | 3;

/**
 * Scores represent the latest self-assessment for a card, rather than an
 * inflated total of every click. Cards not yet reviewed contribute zero.
 */
export function confidenceScore(confidence: PracticeConfidence): number {
  return confidence === 1 ? 0 : confidence === 2 ? 50 : 100;
}

export function storedConfidenceScore(value: { confidenceScore?: number; lastConfidence?: PracticeConfidence }): number {
  if (typeof value.confidenceScore === "number" && Number.isFinite(value.confidenceScore)) {
    return Math.min(100, Math.max(0, Math.round(value.confidenceScore)));
  }
  return value.lastConfidence ? confidenceScore(value.lastConfidence) : 0;
}
