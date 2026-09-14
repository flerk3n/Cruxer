import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { JsonGenerator } from "./gemini";
import { GeminiJsonGenerator } from "./gemini";

vi.mock("@cruxer/domain", async () => import("../../domain/src/index"));

const jd = "Senior TypeScript engineer required. You must mentor junior engineers. Kubernetes experience is a bonus.";

describe("CruxerKitPipeline", () => {
  it("uses staged calls, closes coverage in a second pass, and validates the final kit", async () => {
    const { CruxerKitPipeline } = await import("./pipeline");
    const prompts: string[] = [];
    const generator: JsonGenerator = {
      async generate<TSchema extends z.ZodType>(request: { prompt: string; schema: TSchema }): Promise<z.infer<TSchema>> {
        prompts.push(request.prompt);
        let value: unknown;
        if (request.prompt.includes("Extract only explicit")) {
          value = { title: "Senior Engineer", seniority: "Senior", location: "Remote", responsibilities: ["Build services"], requirements: [
            { text: "TypeScript", kind: "technical", priority: "must", evidence: "TypeScript engineer required" },
            { text: "Mentor junior engineers", kind: "behavioural", priority: "must", evidence: "must mentor junior engineers" },
            { text: "Kubernetes", kind: "technical", priority: "nice", evidence: "Kubernetes experience is a bonus" }
          ] };
        } else if (request.prompt.includes("factual company brief")) {
          value = { summary: "Acme makes developer tools.", what_they_do: "Developer tooling." };
        } else if (request.prompt.includes("Create compact recall")) {
          value = { flashcards: [{ front: "TypeScript?", back: "Explain a project.", requirement_ids: ["req-1"] }] };
        } else if (request.prompt.includes("uncovered requirements")) {
          value = { questions: [{ requirement_ids: ["req-2"], prompt: "How do you mentor?", answer_outline: "Use a STAR example.", difficulty: 2 }] };
        } else if (request.prompt.includes("behavioural")) {
          value = { questions: [] };
        } else {
          value = { questions: [{ requirement_ids: ["req-1", "req-3"], prompt: "Explain a TypeScript design.", answer_outline: "Discuss trade-offs.", difficulty: 3 }] };
        }
        return request.schema.parse(value);
      }
    };
    const pipeline = new CruxerKitPipeline({
      generator,
      research: { research: async () => ({ documents: [{ url: "https://acme.example", text: "Acme makes developer tools.", score: 1, provenance: { type: "company-site", discovered_by: "landing" } }], warnings: [] }) },
      now: () => new Date("2026-09-14T00:00:00.000Z")
    });

    const kit = await pipeline.run({ jd, company_url: "https://acme.example", days: 3 });

    expect(kit.coverage).toEqual({ uncovered_requirement_ids: [], passes: 2 });
    expect(kit.schedule.days).toHaveLength(3);
    expect(kit.questions.some((question) => question.requirement_ids.includes("req-2"))).toBe(true);
    expect(prompts.filter((prompt) => prompt.includes("Generate likely")).length).toBeGreaterThanOrEqual(4);
    expect(prompts.some((prompt) => prompt.includes("uncovered requirements"))).toBe(true);
  });

  it("uses a deterministic fallback if the correction pass still omits a requirement", async () => {
    const { CruxerKitPipeline } = await import("./pipeline");
    const generator: JsonGenerator = {
      async generate<TSchema extends z.ZodType>(request: { prompt: string; schema: TSchema }): Promise<z.infer<TSchema>> {
        const value = request.prompt.includes("Extract only explicit")
          ? { title: "Engineer", seniority: "Not specified", location: "", responsibilities: [], requirements: [{ text: "TypeScript", kind: "technical", priority: "must", evidence: "TypeScript engineer required" }] }
          : request.prompt.includes("factual company brief")
            ? { summary: "Unknown", what_they_do: "Unknown" }
            : request.prompt.includes("Create compact recall")
              ? { flashcards: [] }
              : { questions: [] };
        return request.schema.parse(value);
      }
    };
    const pipeline = new CruxerKitPipeline({ generator, research: { research: async () => ({ documents: [{ url: "https://acme.example", text: "Acme", score: 1, provenance: { type: "company-site", discovered_by: "landing" } }], warnings: [] }) } });
    const kit = await pipeline.run({ jd, company_url: "https://acme.example", days: 1 });
    expect(kit.coverage).toEqual({ uncovered_requirement_ids: [], passes: 3 });
    expect(kit.questions[0]?.id).toMatch(/^q-fallback-/);
  });

  it("returns a valid thin-JD kit while surfacing non-fatal research warnings", async () => {
    const { CruxerKitPipeline } = await import("./pipeline");
    const events: Array<{ step: string; status: string; message?: string }> = [];
    const generator: JsonGenerator = {
      async generate<TSchema extends z.ZodType>(request: { prompt: string; schema: TSchema }): Promise<z.infer<TSchema>> {
        const value = request.prompt.includes("Extract only explicit")
          ? { title: "Engineer", seniority: "Not specified", location: "", responsibilities: [], requirements: [] }
          : request.prompt.includes("factual company brief")
            ? { summary: "Limited public information.", what_they_do: "Not established." }
            : request.prompt.includes("Create compact recall")
              ? { flashcards: [] }
              : { questions: [] };
        return request.schema.parse(value);
      }
    };
    const pipeline = new CruxerKitPipeline({
      generator,
      research: {
        research: async () => ({
          documents: [],
          warnings: [{ code: "PUBLIC_DISCUSSION_UNAVAILABLE", message: "Public discussion search was unavailable." }]
        })
      }
    });

    const kit = await pipeline.run(
      { jd: "Seeking an engineer.", company_url: "https://acme.example", days: 1 },
      { onStep: (event) => { events.push(event); } }
    );

    expect(kit.role.requirements).toEqual([]);
    expect(kit.questions).toEqual([]);
    expect(events).toContainEqual({ step: "research", status: "warning", message: "Public discussion search was unavailable." });
    expect(events).toContainEqual({ step: "role", status: "completed", message: "The posting contained few explicit requirements." });
  });

  it("recovers source-grounded requirements and practice cards when provider output is empty or mismatched", async () => {
    const { CruxerKitPipeline } = await import("./pipeline");
    const generator: JsonGenerator = {
      async generate<TSchema extends z.ZodType>(request: { prompt: string; schema: TSchema }): Promise<z.infer<TSchema>> {
        const value = request.prompt.includes("Extract only explicit")
          ? { title: "Engineer", seniority: "Not specified", location: "", responsibilities: [], requirements: [{ text: "Server-rendered templating", kind: "technical", priority: "must", evidence: "The candidate knows server-rendered templating" }] }
          : request.prompt.includes("factual company brief")
            ? { summary: "Acme builds software.", what_they_do: "Software." }
            : request.prompt.includes("Create compact recall")
              ? { flashcards: [] }
              : { questions: [] };
        return request.schema.parse(value);
      }
    };
    const pipeline = new CruxerKitPipeline({
      generator,
      research: { research: async () => ({ documents: [{ url: "https://acme.example", text: "Acme", score: 1, provenance: { type: "company-site", discovered_by: "landing" } }], warnings: [] }) }
    });

    const kit = await pipeline.run({
      jd: "What you will do\n• Build production TypeScript APIs\n• Own Docker deployments and CI/CD",
      company_url: "https://acme.example",
      days: 2
    });

    expect(kit.role.requirements.map((requirement) => requirement.text)).toContain("Build production TypeScript APIs");
    expect(kit.questions.length).toBeGreaterThan(0);
    expect(kit.flashcards).toHaveLength(12);
    for (const requirement of kit.role.requirements) {
      expect(kit.flashcards.filter((card) => card.requirement_ids.includes(requirement.id)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("retries malformed Gemini JSON before returning Zod-validated data", async () => {
    let calls = 0;
    const generator = new GeminiJsonGenerator({
      apiKey: "test",
      retry: { baseDelayMs: 0, sleep: async () => undefined },
      client: { models: { generateContent: async () => {
        calls += 1;
        return { text: calls === 1 ? "not-json" : '{"value":"ok"}' };
      } } }
    });
    await expect(generator.generate({ prompt: "test", schema: z.object({ value: z.literal("ok") }) })).resolves.toEqual({ value: "ok" });
    expect(calls).toBe(2);
  });

  it("retries JSON that parses but fails the requested model schema", async () => {
    let calls = 0;
    const generator = new GeminiJsonGenerator({
      apiKey: "test",
      retry: { baseDelayMs: 0, sleep: async () => undefined },
      client: { models: { generateContent: async () => {
        calls += 1;
        return { text: calls === 1 ? '{"value":"not-ok"}' : '{"value":"ok"}' };
      } } }
    });

    await expect(generator.generate({ prompt: "test", schema: z.object({ value: z.literal("ok") }) })).resolves.toEqual({ value: "ok" });
    expect(calls).toBe(2);
  });
});
