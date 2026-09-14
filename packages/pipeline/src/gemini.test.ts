import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GeminiJsonGenerator } from "./gemini";

const schema = z.object({ value: z.literal("ok") });

describe("GeminiJsonGenerator resilience", () => {
  it("serialises concurrent generation requests at the configured pace", async () => {
    let now = 0;
    const starts: number[] = [];
    const generator = new GeminiJsonGenerator({
      apiKey: "test",
      minRequestIntervalMs: 4_500,
      now: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
      client: { models: { generateContent: async () => { starts.push(now); return { text: '{"value":"ok"}' }; } } }
    });

    await Promise.all([
      generator.generate({ prompt: "first", schema }),
      generator.generate({ prompt: "second", schema })
    ]);

    expect(starts).toEqual([0, 4_500]);
  });

  it("waits for Gemini's advertised 429 retry delay instead of retrying immediately", async () => {
    const waits: number[] = [];
    let calls = 0;
    const generator = new GeminiJsonGenerator({
      apiKey: "test",
      minRequestIntervalMs: 0,
      retry: { maxAttempts: 2, baseDelayMs: 50, sleep: async (milliseconds) => { waits.push(milliseconds); } },
      client: { models: { generateContent: async () => {
        calls += 1;
        if (calls === 1) throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"4s"}]}}');
        return { text: '{"value":"ok"}' };
      } } }
    });

    await expect(generator.generate({ prompt: "test", schema })).resolves.toEqual({ value: "ok" });
    expect(waits).toEqual([4_000]);
  });

  it("uses one schema-aware repair attempt and stops after a second invalid response", async () => {
    const prompts: string[] = [];
    const generator = new GeminiJsonGenerator({
      apiKey: "test",
      minRequestIntervalMs: 0,
      retry: { maxAttempts: 3, baseDelayMs: 0, sleep: async () => undefined },
      client: { models: { generateContent: async ({ contents }) => {
        prompts.push(contents);
        return { text: '{"value":"not-ok"}' };
      } } }
    });

    await expect(generator.generate({ prompt: "Return the expected object.", schema })).rejects.toMatchObject({ code: "GENERATION_INVALID" });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("previous structured response failed validation");
    expect(prompts[1]).toContain("value:");
  });
});
