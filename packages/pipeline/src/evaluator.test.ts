import { describe, expect, it } from "vitest";
import type { Kit } from "@cruxer/domain";
import { PipelineError, type KitPipeline } from "./index";
import { batchOutputSchema, type BatchInput } from "./input-schema";
import { evaluateCases } from "../../../scripts/evaluate";

const validKit: Kit = {
  source: {
    company: "Acme",
    company_url: "https://acme.example",
    role: "Engineer",
    location: "Remote",
    jd_chars: 20,
    researched_at: "2026-09-14T00:00:00.000Z",
    pages_used: ["https://acme.example"]
  },
  company_brief: { summary: "Acme makes tools.", what_they_do: "Developer tools.", sources: ["https://acme.example"] },
  role: { title: "Engineer", seniority: "Senior", responsibilities: [], requirements: [] },
  questions: [],
  flashcards: [],
  schedule: { days_available: 1, days: [{ day: 1, focus: "Review", question_ids: [], minutes: 0 }] },
  coverage: { uncovered_requirement_ids: [], passes: 1 }
};

describe("batch evaluator", () => {
  it("continues after a failed case and emits the Appendix B output envelope", async () => {
    const calls: string[] = [];
    const pipeline: KitPipeline = {
      async run(input) {
        calls.push(input.jd);
        if (input.jd === "bad JD") throw new PipelineError("GENERATION_INVALID", "Model response was invalid.");
        return validKit;
      }
    };
    const cases: BatchInput = [
      { id: "bad", jd: "bad JD", company_url: "https://bad.example", days: 1 },
      { id: "good", jd: "good JD", company_url: "https://good.example", days: 1 }
    ];

    const output = await evaluateCases(cases, pipeline);

    expect(calls).toEqual(["bad JD", "good JD"]);
    expect(batchOutputSchema.parse(output)).toEqual(output);
    expect(output).toMatchObject({
      version: "1.0",
      kits: [
        { id: "bad", status: "failed", kit: null, error: { code: "GENERATION_INVALID", message: "Model response was invalid." } },
        { id: "good", status: "ok", kit: validKit, error: null }
      ]
    });
  });

  it("normalizes unexpected failures while allowing subsequent cases to run", async () => {
    let attempts = 0;
    const pipeline: KitPipeline = {
      async run() {
        attempts += 1;
        if (attempts === 1) throw new Error("network disconnected");
        return validKit;
      }
    };

    const output = await evaluateCases([
      { id: "first", jd: "first JD", company_url: "https://first.example", days: 1 },
      { id: "second", jd: "second JD", company_url: "https://second.example", days: 1 }
    ], pipeline);

    expect(output.kits[0]).toMatchObject({ status: "failed", error: { code: "GENERATION_FAILED", message: "network disconnected" } });
    expect(output.kits[1]).toMatchObject({ status: "ok", kit: validKit });
  });
});
