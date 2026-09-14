import { describe, expect, it } from "vitest";
import { discoverResearchLinks } from "./link-discovery";
import { retry } from "./retry";
import { RobotsPolicy } from "./robots";

describe("research primitives", () => {
  it("ranks discovered relative hiring links and ignores external links", () => {
    const links = discoverResearchLinks(`
      <a href="/values">Our values</a><a href="/careers/interviews">Interview process</a>
      <a href="https://elsewhere.example/jobs">External jobs</a>`, "https://acme.example/about");
    expect(links.map((link) => link.url)).toEqual(["https://acme.example/careers/interviews", "https://acme.example/values"]);
  });

  it("honours robots disallow rules while allowing a more-specific allow rule", async () => {
    const robots = new RobotsPolicy(async () => "User-agent: *\nDisallow: /careers\nAllow: /careers/interview-guide\n");
    await expect(robots.assertCanFetch("https://acme.example/careers")).rejects.toThrow(/robots/i);
    await expect(robots.assertCanFetch("https://acme.example/careers/interview-guide")).resolves.toBeUndefined();
  });

  it("retries bounded failures with injectable delays", async () => {
    let calls = 0;
    const delays: number[] = [];
    const value = await retry(async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary");
      return "ok";
    }, { jitter: () => 0.5, sleep: async (delay) => { delays.push(delay); } });
    expect(value).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([300, 600]);
  });
});
