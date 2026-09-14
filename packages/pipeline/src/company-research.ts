import { discoverResearchLinks, cleanPageText, type DiscoveredLink } from "./link-discovery";
import { PipelineError } from "./errors";
import type { RobotsPolicy } from "./robots";
import type { RetrievedPage, SafeTextFetcher } from "./safe-fetch";

export interface ResearchWarning {
  code: "ROBOTS_DENIED" | "PAGE_UNREACHABLE" | "NO_DISCOVERABLE_LINKS";
  message: string;
  url?: string;
}

export interface ResearchDocument {
  url: string;
  text: string;
  score: number;
}

export interface CompanyResearchResult {
  documents: ResearchDocument[];
  warnings: ResearchWarning[];
}

/** Bounded same-site crawl. One failed candidate becomes a warning, never a whole-run failure. */
export class CompanyResearchService {
  constructor(
    private readonly robots: RobotsPolicy,
    private readonly fetcher: SafeTextFetcher,
    private readonly maxCandidatePages = 5
  ) {}

  async research(companyUrl: string): Promise<CompanyResearchResult> {
    const warnings: ResearchWarning[] = [];
    const landing = await this.fetchAllowed(companyUrl, warnings);
    if (!landing) throw new PipelineError("COMPANY_UNREACHABLE", "Company landing page could not be retrieved.");

    const candidates = discoverResearchLinks(landing.body, landing.url, this.maxCandidatePages);
    if (candidates.length === 0) warnings.push({ code: "NO_DISCOVERABLE_LINKS", message: "No relevant same-site research links were discovered." });
    const documents: ResearchDocument[] = [{ url: landing.url, text: cleanPageText(landing.body), score: 0 }];

    for (const candidate of candidates) {
      const page = await this.fetchAllowed(candidate.url, warnings);
      if (page) documents.push(toDocument(page, candidate));
    }
    return { documents, warnings };
  }

  private async fetchAllowed(url: string, warnings: ResearchWarning[]): Promise<RetrievedPage | undefined> {
    try {
      await this.robots.assertCanFetch(url);
      return await this.fetcher.fetchText(url);
    } catch (error) {
      if (error instanceof PipelineError && error.code === "ROBOTS_DENIED") {
        warnings.push({ code: "ROBOTS_DENIED", message: "A page was skipped because robots.txt disallows it.", url });
      } else {
        warnings.push({ code: "PAGE_UNREACHABLE", message: "A discovered company page could not be retrieved.", url });
      }
      return undefined;
    }
  }
}

function toDocument(page: RetrievedPage, candidate: DiscoveredLink): ResearchDocument {
  return { url: page.url, text: cleanPageText(page.body), score: candidate.score };
}
