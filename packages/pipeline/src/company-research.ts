import { discoverResearchLinks, cleanPageText, type DiscoveredLink } from "./link-discovery";
import { PipelineError } from "./errors";
import type { PublicDiscussionSearch, PublicDiscussionSearchResult } from "./public-discussion-search";
import type { RobotsPolicy } from "./robots";
import type { RetrievedPage, SafeTextFetcher } from "./safe-fetch";

export interface ResearchWarning {
  code: "ROBOTS_DENIED" | "PAGE_UNREACHABLE" | "NO_DISCOVERABLE_LINKS" | "NO_PUBLIC_DISCUSSION" | "PUBLIC_DISCUSSION_UNAVAILABLE";
  message: string;
  url?: string;
}

/** Records how a retrieved page entered the evidence set. */
export interface ResearchProvenance {
  type: "company-site" | "public-discussion";
  discovered_by: "landing" | "company-crawl" | "tavily";
  query?: string;
  title?: string;
}

export interface ResearchDocument {
  url: string;
  text: string;
  score: number;
  provenance: ResearchProvenance;
}

export interface CompanyResearchResult {
  documents: ResearchDocument[];
  warnings: ResearchWarning[];
}

export interface CompanyResearchOptions {
  maxCandidatePages?: number;
  maxPublicDiscussionPages?: number;
  publicDiscussionSearch?: PublicDiscussionSearch;
}

/** Bounded same-site crawl. One failed candidate becomes a warning, never a whole-run failure. */
export class CompanyResearchService {
  private readonly maxCandidatePages: number;
  private readonly maxPublicDiscussionPages: number;
  private readonly publicDiscussionSearch?: PublicDiscussionSearch;

  constructor(
    private readonly robots: RobotsPolicy,
    private readonly fetcher: SafeTextFetcher,
    options: CompanyResearchOptions = {}
  ) {
    this.maxCandidatePages = options.maxCandidatePages ?? 5;
    this.maxPublicDiscussionPages = options.maxPublicDiscussionPages ?? 4;
    this.publicDiscussionSearch = options.publicDiscussionSearch;
  }

  async research(companyUrl: string, context: { roleTitle?: string } = {}): Promise<CompanyResearchResult> {
    const warnings: ResearchWarning[] = [];
    const landing = await this.fetchAllowed(companyUrl, warnings);
    if (!landing) throw new PipelineError("COMPANY_UNREACHABLE", "Company landing page could not be retrieved.");

    const candidates = discoverResearchLinks(landing.body, landing.url, this.maxCandidatePages);
    if (candidates.length === 0) warnings.push({ code: "NO_DISCOVERABLE_LINKS", message: "No relevant same-site research links were discovered." });
    const documents: ResearchDocument[] = [{
      url: landing.url,
      text: cleanPageText(landing.body),
      score: 0,
      provenance: { type: "company-site", discovered_by: "landing" }
    }];

    for (const candidate of candidates) {
      const page = await this.fetchAllowed(candidate.url, warnings);
      if (page) documents.push(toCompanyDocument(page, candidate));
    }
    await this.addPublicDiscussion(companyUrl, documents, warnings, context.roleTitle);
    return { documents, warnings };
  }

  private async addPublicDiscussion(companyUrl: string, documents: ResearchDocument[], warnings: ResearchWarning[], roleTitle?: string): Promise<void> {
    if (!this.publicDiscussionSearch) return;
    let results: PublicDiscussionSearchResult[];
    try {
      results = await this.publicDiscussionSearch.search({ companyName: companyNameFromUrl(companyUrl), companyUrl, roleTitle });
    } catch {
      warnings.push({ code: "PUBLIC_DISCUSSION_UNAVAILABLE", message: "Public interview discussion search was unavailable; the kit uses company-site research only." });
      return;
    }
    if (results.length === 0) {
      warnings.push({ code: "NO_PUBLIC_DISCUSSION", message: "No public discussion of the company interview process was found." });
      return;
    }
    for (const result of results.slice(0, this.maxPublicDiscussionPages)) {
      const page = await this.fetchAllowed(result.url, warnings);
      if (page) {
        documents.push({
          url: page.url,
          text: cleanPageText(page.body),
          score: result.score,
          provenance: { type: "public-discussion", discovered_by: "tavily", query: result.query, title: result.title }
        });
      } else if (result.excerpt) {
        documents.push({
          url: result.url,
          text: result.excerpt,
          score: result.score,
          provenance: { type: "public-discussion", discovered_by: "tavily", query: result.query, title: result.title }
        });
      }
    }
  }

  private async fetchAllowed(url: string, warnings: ResearchWarning[]): Promise<RetrievedPage | undefined> {
    try {
      await this.robots.assertCanFetch(url);
      return await this.fetcher.fetchText(url);
    } catch (error) {
      if (error instanceof PipelineError && error.code === "ROBOTS_DENIED") {
        warnings.push({ code: "ROBOTS_DENIED", message: "A page was skipped because robots.txt disallows it.", url });
      } else {
        warnings.push({ code: "PAGE_UNREACHABLE", message: "A discovered research source could not be retrieved.", url });
      }
      return undefined;
    }
  }
}

function toCompanyDocument(page: RetrievedPage, candidate: DiscoveredLink): ResearchDocument {
  return {
    url: page.url,
    text: cleanPageText(page.body),
    score: candidate.score,
    provenance: { type: "company-site", discovered_by: "company-crawl", title: candidate.text || undefined }
  };
}

function companyNameFromUrl(rawUrl: string): string {
  const hostname = new URL(rawUrl).hostname.replace(/^www\./i, "");
  return (hostname.split(".")[0] || hostname).replace(/[-_]+/g, " ");
}
