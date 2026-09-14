import { PipelineError } from "./errors";

export type RobotsTextFetcher = (url: string) => Promise<string | undefined>;

export interface RobotsDecision {
  allowed: boolean;
  robotsUrl: string;
  available: boolean;
}

/** Caches per-origin robots.txt and applies the most-specific matching rule. */
export class RobotsPolicy {
  private readonly cache = new Map<string, Promise<ParsedRobots | undefined>>();

  constructor(private readonly fetchRobotsText: RobotsTextFetcher, private readonly userAgent = "CruxerResearchBot") {}

  async canFetch(rawUrl: string): Promise<RobotsDecision> {
    const url = new URL(rawUrl);
    const origin = url.origin;
    const robotsUrl = new URL("/robots.txt", origin).toString();
    let robots = this.cache.get(origin);
    if (!robots) {
      robots = this.fetchRobotsText(robotsUrl)
        .then((text) => (text === undefined ? undefined : parseRobots(text)))
        .catch(() => undefined);
      this.cache.set(origin, robots);
    }
    const parsed = await robots;
    if (!parsed) return { allowed: true, robotsUrl, available: false };
    return { allowed: isPathAllowed(parsed, this.userAgent, `${url.pathname}${url.search}`), robotsUrl, available: true };
  }

  async assertCanFetch(url: string): Promise<void> {
    const decision = await this.canFetch(url);
    if (!decision.allowed) throw new PipelineError("ROBOTS_DENIED", "Retrieval is disallowed by robots.txt.");
  }
}

interface Rule { directive: "allow" | "disallow"; path: string }
interface Group { agents: string[]; rules: Rule[] }
interface ParsedRobots { groups: Group[] }

function parseRobots(text: string): ParsedRobots {
  const groups: Group[] = [];
  let group: Group | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const directive = match[1].toLowerCase();
    const value = match[2].trim();
    if (directive === "user-agent") {
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if ((directive === "allow" || directive === "disallow") && group) {
      group.rules.push({ directive, path: value });
    }
  }
  return { groups };
}

function isPathAllowed(robots: ParsedRobots, userAgent: string, path: string): boolean {
  const agent = userAgent.toLowerCase();
  const matchingGroups = robots.groups.filter((group) => group.agents.some((candidate) => candidate === "*" || agent.includes(candidate)));
  const exactGroups = matchingGroups.filter((group) => group.agents.some((candidate) => candidate !== "*" && agent.includes(candidate)));
  const rules = (exactGroups.length > 0 ? exactGroups : matchingGroups).flatMap((group) => group.rules);
  let winner: Rule | undefined;
  for (const rule of rules) {
    if (!rule.path || !matchesRule(rule.path, path)) continue;
    if (!winner || rule.path.length > winner.path.length || (rule.path.length === winner.path.length && rule.directive === "allow")) winner = rule;
  }
  return winner?.directive !== "disallow";
}

function matchesRule(pattern: string, path: string): boolean {
  const end = pattern.endsWith("$");
  const source = pattern.replace(/\$$/, "").split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${source}${end ? "$" : ""}`).test(path);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
