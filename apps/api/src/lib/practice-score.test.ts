import { describe, expect, it } from "vitest";
import { confidenceScore, storedConfidenceScore } from "./practice-score.js";

describe("practice confidence score", () => {
  it("uses stable weights for the three self-assessments", () => {
    expect(confidenceScore(1)).toBe(0);
    expect(confidenceScore(2)).toBe(50);
    expect(confidenceScore(3)).toBe(100);
  });

  it("keeps historical progress records useful after the score field is introduced", () => {
    expect(storedConfidenceScore({ lastConfidence: 2 })).toBe(50);
    expect(storedConfidenceScore({ confidenceScore: 130, lastConfidence: 1 })).toBe(100);
  });
});
