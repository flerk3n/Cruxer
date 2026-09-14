import { describe, expect, it } from "vitest";

import { calculateUncoveredRequirementIds, kitSchema, type Kit } from "./kit-schema";

function makeKit(overrides: Partial<Kit> = {}): Kit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.example",
      role: "Frontend Engineer",
      location: "Remote",
      jd_chars: 120,
      researched_at: "2026-09-14T10:00:00.000Z",
      pages_used: ["https://acme.example/about"]
    },
    company_brief: {
      summary: "Acme builds dependable tools.",
      what_they_do: "Workflow software.",
      sources: ["https://acme.example/about"]
    },
    role: {
      title: "Frontend Engineer",
      seniority: "Senior",
      responsibilities: ["Build user interfaces."],
      requirements: [
        { id: "r1", text: "5 years of React", kind: "technical", priority: "must" },
        { id: "r2", text: "Mentor engineers", kind: "behavioural", priority: "nice" }
      ]
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "How would you structure a complex React feature?",
        answer_outline: "Discuss boundaries, state, tests, and trade-offs.",
        difficulty: 2
      }
    ],
    flashcards: [
      { id: "f1", front: "React state boundary", back: "Keep state close to its consumers.", requirement_ids: ["r1"] }
    ],
    schedule: {
      days_available: 1,
      days: [
        { day: 1, focus: "Strengthen technical foundations", question_ids: ["q1"], minutes: 20 }
      ]
    },
    coverage: { uncovered_requirement_ids: ["r2"], passes: 1 },
    ...overrides
  };
}

describe("kitSchema", () => {
  it("accepts an Appendix A kit with derived coverage", () => {
    expect(kitSchema.safeParse(makeKit()).success).toBe(true);
  });

  it("rejects unknown requirement and schedule references", () => {
    const kit = makeKit({
      questions: [
        {
          ...makeKit().questions[0]!,
          requirement_ids: ["missing"]
        }
      ],
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: "Review", question_ids: ["missing-question"], minutes: 20 }]
      }
    });

    expect(kitSchema.safeParse(kit).success).toBe(false);
  });

  it("rejects coverage supplied by a model when it disagrees with question ids", () => {
    const kit = makeKit({ coverage: { uncovered_requirement_ids: [], passes: 1 } });

    expect(kitSchema.safeParse(kit).success).toBe(false);
  });

  it("calculates coverage without an LLM decision", () => {
    const kit = makeKit();
    expect(calculateUncoveredRequirementIds(kit.role.requirements, kit.questions)).toEqual(["r2"]);
  });
});
