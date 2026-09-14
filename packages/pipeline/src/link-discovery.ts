export interface DiscoveredLink {
  url: string;
  text: string;
  score: number;
}

const RESEARCH_TERMS = [
  "careers", "career", "jobs", "hiring", "interview", "recruiting", "about", "company", "mission",
  "values", "handbook", "culture", "engineering", "team", "people", "product"
];

/**
 * Finds same-origin links from an already fetched HTML page. Discovery is
 * deliberately page-driven; it never guesses a fixed list of paths.
 */
export function discoverResearchLinks(html: string, baseUrl: string, limit = 12): DiscoveredLink[] {
  const base = new URL(baseUrl);
  const found = new Map<string, DiscoveredLink>();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = attribute(match[1], "href");
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let target: URL;
    try {
      target = new URL(href, base);
    } catch {
      continue;
    }
    if (target.origin !== base.origin || !["http:", "https:"].includes(target.protocol)) continue;
    target.hash = "";
    const url = target.toString();
    const text = cleanText(match[2]);
    const score = scoreLink(url, text);
    const current = found.get(url);
    if (!current || score > current.score) found.set(url, { url, text, score });
  }
  return [...found.values()]
    .filter((link) => link.score > 0)
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, limit);
}

export function cleanPageText(html: string, maxCharacters = 30_000): string {
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim().slice(0, maxCharacters);
}

function attribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function scoreLink(url: string, text: string): number {
  const haystack = `${url} ${text}`.toLowerCase();
  return RESEARCH_TERMS.reduce((score, term) => score + (haystack.includes(term) ? term === "hiring" || term === "interview" ? 5 : 2 : 0), 0);
}

function cleanText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}
