import { describe, expect, it } from "vitest";
import { scopedRegeneration } from "./generation-orchestrator.js";

describe("scopedRegeneration", () => {
  it("does not treat Mongoose's empty nested object as a regeneration", () => {
    expect(scopedRegeneration({})).toBeUndefined();
  });

  it("retains a real scoped regeneration request", () => {
    expect(scopedRegeneration({ section: "questions", category: "technical" })).toEqual({
      section: "questions",
      category: "technical"
    });
  });
});
