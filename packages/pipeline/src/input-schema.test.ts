import { describe, expect, it } from "vitest";
import { batchInputSchema, pipelineInputSchema } from "./input-schema";

describe("pipeline input schemas", () => {
  it("accepts the Appendix B input shape", () => {
    expect(batchInputSchema.parse([{ id: "case-1", jd: "Build APIs", company_url: "https://example.com/jobs", days: 5 }])[0].id).toBe("case-1");
  });

  it("rejects duplicate case ids and unsafe input bounds", () => {
    expect(() => batchInputSchema.parse([
      { id: "case", jd: "One", company_url: "https://example.com", days: 1 },
      { id: "case", jd: "Two", company_url: "https://example.com", days: 2 }
    ])).toThrow(/Duplicate/);
    expect(() => pipelineInputSchema.parse({ jd: "x", company_url: "ftp://example.com", days: 0 })).toThrow();
  });
});
