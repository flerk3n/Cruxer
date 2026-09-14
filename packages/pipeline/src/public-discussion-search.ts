import { PipelineError } from "./errors";
import { retry, type RetryOptions } from "./retry";

export interface PublicDiscussionSearchInput {
  /** A displayable company name derived from the supplied company URL. */
  companyName: string;
  companyUrl: string;
}

export interface PublicDiscussionSearchResult {
  url: string;
  title?: string;
  score: number;
  /** The bounded provider query that surfaced this result. */
  query: string;
}

/** Provider boundary: the research service never depends on a search vendor. */
export interface PublicDiscussionSearch {
  search(input: PublicDiscussionSearchInput): Promise<PublicDiscussionSearchResult[]>;
}

type TavilyResponse = {
  results?: Array<{ url?: string; title?: string; score?: number }>;
};

export interface TavilyPublicDiscussionSearchOptions {
  apiKey?: string;
  fetchImplementation?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
  /** Capped at two so one kit cannot consume an unbounded search quota. */
  maxQueries?: number;
  maxResultsPerQuery?: number;
  /** A final cap after query-level results are merged and deduplicated. */
  maxResults?: number;
  retry?: RetryOptions;
}

/**
 * Small, deliberately bounded Tavily adapter for public interview-process
 * discussion. It returns links only; each page still has to pass robots and
 * safe-fetch checks before it can become retrieval evidence.
 */
export class TavilyPublicDiscussionSearch implements PublicDiscussionSearch {
  private readonly apiKey?: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxQueries: number;
  private readonly maxResultsPerQuery: number;
  private readonly maxResults: number;
  private readonly retryOptions?: RetryOptions;

  constructor(options: TavilyPublicDiscussionSearchOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.TAVILY_API_KEY;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.endpoint = options.endpoint ?? "https://api.tavily.com/search";
    this.timeoutMs = options.timeoutMs ?? 7_000;
    this.maxQueries = clamp(options.maxQueries ?? 2, 1, 2);
    this.maxResultsPerQuery = clamp(options.maxResultsPerQuery ?? 3, 1, 5);
    this.maxResults = clamp(options.maxResults ?? 4, 1, this.maxQueries * this.maxResultsPerQuery);
    this.retryOptions = options.retry;
  }

  async search(input: PublicDiscussionSearchInput): Promise<PublicDiscussionSearchResult[]> {
    if (!this.apiKey) throw new PipelineError("PUBLIC_DISCUSSION_UNAVAILABLE", "TAVILY_API_KEY is required to search public interview discussions.");
    const queries = buildInterviewDiscussionQueries(input.companyName).slice(0, this.maxQueries);
    const batches = await Promise.all(queries.map(async (query) => this.searchQuery(query)));
    const deduplicated = new Map<string, PublicDiscussionSearchResult>();

    for (const batch of batches) {
      for (const result of batch) {
        const existing = deduplicated.get(result.url);
        if (!existing || result.score > existing.score) deduplicated.set(result.url, result);
      }
    }
    return [...deduplicated.values()]
      .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
      .slice(0, this.maxResults);
  }

  private async searchQuery(query: string): Promise<PublicDiscussionSearchResult[]> {
    return retry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImplementation(this.endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            api_key: this.apiKey,
            query,
            topic: "general",
            search_depth: "basic",
            max_results: this.maxResultsPerQuery,
            include_answer: false,
            include_raw_content: false
          })
        });
        if (!response.ok) throw new TavilyHttpError(response.status, `Tavily search returned HTTP ${response.status}.`);
        const payload = await response.json() as TavilyResponse;
        if (!Array.isArray(payload.results)) return [];
        return payload.results.flatMap((result) => {
          const url = normalizeHttpUrl(result.url);
          return url ? [{ url, title: cleanTitle(result.title), score: boundedScore(result.score), query }] : [];
        });
      } catch (error) {
        if (error instanceof PipelineError || error instanceof TavilyHttpError) throw error;
        throw new PipelineError("PUBLIC_DISCUSSION_UNAVAILABLE", "Public interview discussion search could not be reached.", error);
      } finally {
        clearTimeout(timeout);
      }
    }, {
      ...this.retryOptions,
      shouldRetry: (error, attempt) => isRetryableSearchError(error) && (this.retryOptions?.shouldRetry?.(error, attempt) ?? true)
    });
  }
}

export function buildInterviewDiscussionQueries(companyName: string): string[] {
  const safeName = companyName.trim().slice(0, 120) || "company";
  return [`${safeName} interview process experience`, `${safeName} interview questions hiring process`];
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanTitle(value: string | undefined): string | undefined {
  const title = value?.replace(/\s+/g, " ").trim().slice(0, 300);
  return title || undefined;
}

function boundedScore(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(Number(value), 1)) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.floor(value), max));
}

class TavilyHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "TavilyHttpError";
  }
}

function isRetryableSearchError(error: unknown): boolean {
  if (error instanceof TavilyHttpError) return error.status === 408 || error.status === 429 || error.status >= 500;
  return error instanceof PipelineError && error.code === "PUBLIC_DISCUSSION_UNAVAILABLE";
}
