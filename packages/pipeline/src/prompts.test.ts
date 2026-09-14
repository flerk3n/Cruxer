import { describe, expect, it } from "vitest";
import { questionsPrompt } from "./prompts";

describe("research prompt source budget", () => {
  it("reserves prompt space for public discussion when company crawling is full", () => {
    const company = Array.from({ length: 5 }, (_, index) => ({
      url: `https://company.example/${index + 1}`,
      text: `company-${index + 1}`,
      score: 0,
      provenance: { type: "company-site" as const, discovered_by: "company-crawl" as const }
    }));
    const discussion = ["public-one", "public-two"].map((text, index) => ({
      url: `https://discussion.example/${index + 1}`,
      text,
      score: 0.8,
      provenance: { type: "public-discussion" as const, discovered_by: "tavily" as const, query: "Acme interview" }
    }));

    const prompt = questionsPrompt({
      category: "technical",
      requirements: [{ id: "req-1", text: "TypeScript", kind: "technical", priority: "must" }],
      jd: "Required TypeScript.",
      research: [...company, ...discussion]
    });

    expect(prompt).toContain("company-4");
    expect(prompt).not.toContain("company-5");
    expect(prompt).toContain("public-one");
    expect(prompt).toContain("public-two");
  });
});
