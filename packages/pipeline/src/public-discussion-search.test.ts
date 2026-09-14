import { describe, expect, it, vi } from "vitest";
import { CompanyResearchService } from "./company-research";
import { PipelineError } from "./errors";
import { TavilyPublicDiscussionSearch } from "./public-discussion-search";
import type { RobotsPolicy } from "./robots";
import type { SafeTextFetcher } from "./safe-fetch";

describe("TavilyPublicDiscussionSearch", () => {
  it("uses at most two focused queries and returns a bounded, deduplicated ranked result set", async () => {
    const requests: Array<{ query: string; max_results: number }> = [];
    const search = new TavilyPublicDiscussionSearch({
      apiKey: "test-key",
      maxQueries: 99,
      maxResultsPerQuery: 99,
      maxResults: 2,
      retry: { maxAttempts: 1 },
      fetchImplementation: vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { query: string; max_results: number };
        requests.push(body);
        return Response.json({ results: [
          { url: "https://discussion.example/duplicate#fragment", title: "One", score: 0.4 },
          { url: `https://discussion.example/${requests.length}`, title: "Result", score: 0.9 },
          { url: "ftp://not-allowed.example/post", score: 1 }
        ] });
      })
    });

    const results = await search.search({ companyName: "Acme", companyUrl: "https://acme.example" });

    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.query)).toEqual([
      "Acme interview process experience",
      "Acme interview questions hiring process"
    ]);
    expect(requests.every((request) => request.max_results === 5)).toBe(true);
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.url)).toEqual(["https://discussion.example/1", "https://discussion.example/2"]);
  });
});

describe("CompanyResearchService public discussion retrieval", () => {
  it("keeps only robots-approved fetched discussion pages and records their Tavily provenance", async () => {
    const fetched: string[] = [];
    const robots = {
      assertCanFetch: async (url: string) => {
        if (url.includes("blocked")) throw new PipelineError("ROBOTS_DENIED", "blocked");
      }
    } as RobotsPolicy;
    const fetcher = {
      fetchText: async (url: string) => {
        fetched.push(url);
        return { url, status: 200, contentType: "text/html", body: url.includes("acme.example") ? "<p>Acme</p>" : "<p>Candidate describes a system design interview.</p>" };
      }
    } as SafeTextFetcher;
    const service = new CompanyResearchService(robots, fetcher, {
      maxCandidatePages: 1,
      publicDiscussionSearch: {
        search: async () => [
          { url: "https://discussion.example/allowed", title: "Acme interview", score: 0.8, query: "acme interview process experience" },
          { url: "https://discussion.example/blocked", title: "Blocked", score: 0.7, query: "acme interview process experience" }
        ]
      }
    });

    const result = await service.research("https://acme.example");

    expect(fetched).toEqual(["https://acme.example", "https://discussion.example/allowed"]);
    expect(result.documents[1]).toMatchObject({
      url: "https://discussion.example/allowed",
      provenance: { type: "public-discussion", discovered_by: "tavily", query: "acme interview process experience", title: "Acme interview" }
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "ROBOTS_DENIED", url: "https://discussion.example/blocked" }));
  });

  it("continues with company evidence when the search provider fails", async () => {
    const robots = { assertCanFetch: async () => undefined } as unknown as RobotsPolicy;
    const fetcher = { fetchText: async (url: string) => ({ url, status: 200, contentType: "text/html", body: "<p>Acme</p>" }) } as SafeTextFetcher;
    const service = new CompanyResearchService(robots, fetcher, { publicDiscussionSearch: { search: async () => { throw new Error("provider down"); } } });

    const result = await service.research("https://acme.example");

    expect(result.documents).toHaveLength(1);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "PUBLIC_DISCUSSION_UNAVAILABLE" }));
  });
});
