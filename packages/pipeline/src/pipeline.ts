import { buildSchedule, calculateUncoveredRequirementIds, kitSchema, type Flashcard, type Kit, type Question, type Requirement } from "@cruxer/domain";
import { CompanyResearchService, type ResearchDocument } from "./company-research";
import { PipelineError } from "./errors";
import { flashcardBatchSchema, jsonSchemas, questionBatchSchema, roleExtractionSchema, companyBriefSchema } from "./generation-schemas";
import { GeminiJsonGenerator, type JsonGenerator } from "./gemini";
import { pipelineInputSchema, type PipelineInput } from "./input-schema";
import { companyBriefPrompt, flashcardsPrompt, questionsPrompt, roleExtractionPrompt } from "./prompts";
import { TavilyPublicDiscussionSearch } from "./public-discussion-search";
import { RobotsPolicy } from "./robots";
import { SafeTextFetcher } from "./safe-fetch";
import { createUrlSafetyPolicy } from "./url-policy";

export type PipelineStep = "input" | "research" | "role" | "questions" | "flashcards" | "coverage" | "schedule" | "validation";

export interface PipelineObserver {
  onStep?(event: { step: PipelineStep; status: "started" | "completed" | "warning" | "failed"; message?: string }): void | Promise<void>;
}

export interface KitPipeline { run(input: PipelineInput, observer?: PipelineObserver): Promise<Kit>; }

export interface CruxerKitPipelineOptions {
  generator?: JsonGenerator;
  research?: Pick<CompanyResearchService, "research">;
  now?: () => Date;
}

/** The production pipeline used by both the HTTP app and the batch evaluator. */
export class CruxerKitPipeline implements KitPipeline {
  private readonly generator: JsonGenerator;
  private readonly research: Pick<CompanyResearchService, "research">;
  private readonly now: () => Date;

  constructor(options: CruxerKitPipelineOptions = {}) {
    this.generator = options.generator ?? new GeminiJsonGenerator();
    this.research = options.research ?? createDefaultResearchService();
    this.now = options.now ?? (() => new Date());
  }

  async run(rawInput: PipelineInput, observer?: PipelineObserver): Promise<Kit> {
    const input = pipelineInputSchema.parse(rawInput);
    await emit(observer, "input", "completed");

    await emit(observer, "role", "started");
    const extracted = await this.generator.generate({ prompt: roleExtractionPrompt(input.jd), schema: roleExtractionSchema, responseJsonSchema: jsonSchemas.role });
    const requirements = materializeRequirements(extracted.requirements, input.jd);
    await emit(observer, "role", "completed", requirements.length === 0 ? "The posting contained few explicit requirements." : undefined);
    const role = { title: extracted.title, seniority: extracted.seniority, responsibilities: extracted.responsibilities, requirements };

    await emit(observer, "research", "started");
    const research = await this.research.research(input.company_url, { roleTitle: role.title });
    for (const warning of research.warnings) await emit(observer, "research", "warning", warning.message);
    await emit(observer, "research", "completed");

    const brief = await this.generateBrief(research.documents, observer);
    await emit(observer, "questions", "started");
    let questions = await this.generateInitialQuestions(requirements, input, research.documents);
    await emit(observer, "questions", "completed");

    await emit(observer, "coverage", "started");
    let coverage = calculateUncoveredRequirementIds(requirements, questions);
    let passes = 1;
    if (coverage.length > 0) {
      await emit(observer, "coverage", "warning", `${coverage.length} requirement(s) need a second question pass.`);
      questions = ensureUniqueQuestionIds([
        ...questions,
        ...await this.generateCorrections(coverage, requirements, input, research.documents)
      ]);
      coverage = calculateUncoveredRequirementIds(requirements, questions);
      passes = 2;
    }
    if (coverage.length > 0) {
      // Code-owned fallback: a must-have requirement never leaves the kit uncovered.
      questions = [...questions, ...createCoverageFallbacks(coverage, requirements, questions.length)];
      coverage = calculateUncoveredRequirementIds(requirements, questions);
      passes = 3;
    }
    await emit(observer, "coverage", "completed", coverage.length === 0 ? "All requirements are covered." : "Some optional requirements remain uncovered.");

    await emit(observer, "flashcards", "started");
    const flashcards = await this.generateFlashcards(requirements, questions);
    await emit(observer, "flashcards", "completed");

    await emit(observer, "schedule", "started");
    const schedule = buildSchedule(input.days, questions, requirements);
    await emit(observer, "schedule", "completed");

    await emit(observer, "validation", "started");
    const kit: Kit = {
      source: { company: new URL(input.company_url).hostname, company_url: input.company_url, role: extracted.title, location: extracted.location || "Not specified", jd_chars: input.jd.length, researched_at: this.now().toISOString(), pages_used: research.documents.map((document) => document.url) },
      company_brief: { ...brief, sources: research.documents.map((document) => document.url) },
      role,
      questions,
      flashcards,
      schedule,
      coverage: { uncovered_requirement_ids: coverage, passes }
    };
    const validated = kitSchema.safeParse(kit);
    if (!validated.success) throw new PipelineError("GENERATION_INVALID", "The generated kit did not satisfy the Appendix A contract.", validated.error.flatten());
    await emit(observer, "validation", "completed");
    return validated.data;
  }

  private async generateBrief(documents: ResearchDocument[], observer?: PipelineObserver) {
    await emit(observer, "research", "started", "Writing company brief from retrieved pages.");
    const brief = await this.generator.generate({ prompt: companyBriefPrompt(documents), schema: companyBriefSchema, responseJsonSchema: jsonSchemas.brief });
    await emit(observer, "research", "completed", "Company brief ready.");
    return brief;
  }

  private async generateInitialQuestions(requirements: Requirement[], input: PipelineInput, documents: ResearchDocument[]): Promise<Question[]> {
    const generated = await Promise.all(questionCategories.map(async (category) => {
      const scoped = requirementsForCategory(requirements, category);
      if (scoped.length === 0) return [];
      const result = await this.generator.generate({ prompt: questionsPrompt({ category, requirements: scoped, jd: input.jd, research: documents }), schema: questionBatchSchema, responseJsonSchema: jsonSchemas.questions });
      return materializeQuestions(result.questions, category, requirements, 0);
    }));
    return generated.flat();
  }

  private async generateCorrections(uncovered: string[], requirements: Requirement[], input: PipelineInput, documents: ResearchDocument[]): Promise<Question[]> {
    const gaps = requirements.filter((requirement) => uncovered.includes(requirement.id));
    const generated = await Promise.all(questionCategories.map(async (category) => {
      const scoped = requirementsForCategory(gaps, category);
      if (scoped.length === 0) return [];
      const result = await this.generator.generate({ prompt: questionsPrompt({ category, requirements: scoped, jd: input.jd, research: documents, correction: true }), schema: questionBatchSchema, responseJsonSchema: jsonSchemas.questions });
      return materializeQuestions(result.questions, category, requirements, 10_000);
    }));
    return ensureUniqueQuestionIds(generated.flat());
  }

  private async generateFlashcards(requirements: Requirement[], questions: Question[]): Promise<Flashcard[]> {
    if (requirements.length === 0) return [];
    const known = new Set(requirements.map((requirement) => requirement.id));
    const target = flashcardTarget(requirements);
    const primary = await this.generator.generate({ prompt: flashcardsPrompt({ requirements: requirements.map(({ id, text }) => ({ id, text })), questions, minimum: target }), schema: flashcardBatchSchema, responseJsonSchema: jsonSchemas.flashcards });
    let candidates = primary.flashcards;
    if (candidates.length < target) {
      const additional = await this.generator.generate({ prompt: flashcardsPrompt({ requirements: requirements.map(({ id, text }) => ({ id, text })), questions, minimum: target - candidates.length, existing: candidates }), schema: flashcardBatchSchema, responseJsonSchema: jsonSchemas.flashcards });
      candidates = [...candidates, ...additional.flashcards];
    }
    const unique = uniqueFlashcards(candidates);
    const flashcards = unique.map((flashcard) => {
      assertKnownRequirementIds(flashcard.requirement_ids, known, "flashcard");
      return flashcard;
    });
    return ensureFlashcardTarget(flashcards, requirements, questions, target).slice(0, 24).map((flashcard, index) => ({ ...flashcard, id: `fc-${index + 1}` }));
  }
}

/** Retained for callers that deliberately have no configured provider. */
export class UnconfiguredKitPipeline implements KitPipeline {
  async run(input: PipelineInput, observer?: PipelineObserver): Promise<Kit> {
    pipelineInputSchema.parse(input);
    await emit(observer, "input", "completed");
    await emit(observer, "research", "failed", "Generation adapters have not been configured.");
    throw new PipelineError("PIPELINE_NOT_CONFIGURED", "Generation adapters have not been configured.");
  }
}

const questionCategories = ["technical", "behavioural", "system-design", "company-fit"] as const;
type QuestionCategory = typeof questionCategories[number];

function materializeRequirements(extracted: Array<{ text: string; kind: Requirement["kind"]; priority: Requirement["priority"]; evidence: string }>, jd: string): Requirement[] {
  const seen = new Set<string>();
  const requirements: Requirement[] = [];
  for (const candidate of extracted) {
    // JD evidence is a code-owned guard against prompt-injected or fabricated
    // requirements. Normalising whitespace/punctuation tolerates harmless
    // provider formatting changes while still requiring source-grounded text.
    if (!hasEvidenceInJobDescription(jd, candidate.evidence) && !hasEvidenceInJobDescription(jd, candidate.text)) continue;
    const key = candidate.text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({ id: `req-${requirements.length + 1}`, text: candidate.text, kind: candidate.kind, priority: candidate.priority });
  }
  return requirements.length > 0 ? requirements : extractExplicitRequirements(jd);
}

function hasEvidenceInJobDescription(jd: string, evidence: string): boolean {
  const source = normaliseEvidence(jd);
  const candidate = normaliseEvidence(evidence);
  return candidate.length >= 3 && source.includes(candidate);
}

function normaliseEvidence(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

/**
 * Last-resort extraction for a model response whose evidence does not survive
 * validation. Each requirement is copied from a signal-bearing JD line, never
 * inferred from company research or free-form model text.
 */
function extractExplicitRequirements(jd: string): Requirement[] {
  const signal = /\b(build|ship|architect|design|develop|own|lead|debug|typescript|javascript|react|node|python|java|aws|gcp|azure|docker|kubernetes|ci\s*\/\s*cd|api|database|testing|mentor|collaborat|experience|proficien|strong)\b/i;
  const technical = /\b(typescript|javascript|react|node|python|java|aws|gcp|azure|docker|kubernetes|ci\s*\/\s*cd|api|database|testing|mern|devops|infrastructure|system|software|engineering)\b/i;
  const behavioural = /\b(mentor|collaborat|communicat|leadership|stakeholder|team)\b/i;
  const lines = jd.split(/\r?\n/)
    .map((line) => line.replace(/^\s*[•*\-]+\s*/, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 240 && signal.test(line));
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = normaliseEvidence(line);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12).map((text, index) => ({
    id: `req-${index + 1}`,
    text,
    kind: technical.test(text) ? "technical" : behavioural.test(text) ? "behavioural" : "domain",
    priority: "must" as const
  }));
}

function requirementsForCategory(requirements: Requirement[], category: QuestionCategory): Requirement[] {
  switch (category) {
    case "technical": return requirements.filter((requirement) => requirement.kind === "technical");
    case "behavioural": return requirements.filter((requirement) => requirement.kind === "behavioural");
    case "system-design": return requirements.filter((requirement) => requirement.kind === "technical");
    case "company-fit": return requirements.filter((requirement) => requirement.kind === "domain" || requirement.kind === "behavioural");
  }
}

function materializeQuestions(generated: Array<{ requirement_ids: string[]; prompt: string; answer_outline: string; difficulty: number }>, category: QuestionCategory, requirements: Requirement[], offset: number): Question[] {
  const known = new Set(requirements.map((requirement) => requirement.id));
  return generated.map((question, index) => {
    assertKnownRequirementIds(question.requirement_ids, known, "question");
    return { ...question, category, id: `q-${category}-${offset + index + 1}` };
  });
}

function ensureUniqueQuestionIds(questions: Question[]): Question[] { return questions.map((question, index) => ({ ...question, id: `q-${index + 1}` })); }

function createCoverageFallbacks(uncovered: string[], requirements: Requirement[], startIndex: number): Question[] {
  return requirements.filter((requirement) => uncovered.includes(requirement.id)).map((requirement, index) => ({
    id: `q-fallback-${startIndex + index + 1}`,
    requirement_ids: [requirement.id],
    category: requirement.kind === "behavioural" ? "behavioural" : requirement.kind === "domain" ? "company-fit" : "technical",
    prompt: `How would you demonstrate your experience with ${requirement.text}?`,
    answer_outline: "Use one concrete example, explain your decisions, quantify the outcome where possible, and connect it to the role.",
    difficulty: requirement.priority === "must" ? 2 : 1
  }));
}

function flashcardTarget(requirements: Requirement[]): number {
  const weightedCoverage = requirements.reduce((total, requirement) => total + (requirement.priority === "must" ? 2 : 1), 0);
  return Math.min(24, Math.max(12, weightedCoverage));
}

function uniqueFlashcards(cards: Array<{ front: string; back: string; requirement_ids: string[] }>): Array<{ front: string; back: string; requirement_ids: string[] }> {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.front.trim().toLocaleLowerCase()}\u0000${card.back.trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureFlashcardTarget(
  existing: Array<{ front: string; back: string; requirement_ids: string[] }>,
  requirements: Requirement[],
  questions: Question[],
  target: number
): Array<{ front: string; back: string; requirement_ids: string[] }> {
  const cards = [...existing];
  const seen = new Set(cards.map((card) => `${card.front.trim().toLocaleLowerCase()}\u0000${card.back.trim().toLocaleLowerCase()}`));
  const add = (card: { front: string; back: string; requirement_ids: string[] }) => {
    const key = `${card.front.trim().toLocaleLowerCase()}\u0000${card.back.trim().toLocaleLowerCase()}`;
    if (cards.length < target && !seen.has(key)) { cards.push(card); seen.add(key); }
  };
  const cardsFor = (requirementId: string) => cards.filter((card) => card.requirement_ids.includes(requirementId)).length;
  for (const requirement of requirements) {
    const quota = requirement.priority === "must" ? 2 : 1;
    const related = questions.filter((question) => question.requirement_ids.includes(requirement.id));
    for (const question of related) {
      if (cardsFor(requirement.id) >= quota) break;
      add({ front: question.prompt, back: question.answer_outline, requirement_ids: question.requirement_ids });
    }
    if (cardsFor(requirement.id) < quota) add({ front: `What approach would you take to demonstrate ${requirement.text}?`, back: "Use one specific example, explain the decision you made, and connect the outcome to this role.", requirement_ids: [requirement.id] });
    if (cardsFor(requirement.id) < quota) add({ front: `Which concrete result best supports your experience with ${requirement.text}?`, back: "Prepare a concise story with the context, your contribution, the trade-off, and a measurable outcome.", requirement_ids: [requirement.id] });
  }
  for (const question of questions) add({ front: question.prompt, back: question.answer_outline, requirement_ids: question.requirement_ids });
  for (const requirement of requirements) add({ front: `What should you emphasise when discussing ${requirement.text}?`, back: "Be specific about your ownership, the technical or collaborative judgment involved, and the outcome.", requirement_ids: [requirement.id] });
  const rehearsalAngles = ["the first decision", "the key trade-off", "the evidence", "the constraint", "the validation", "the collaboration", "the measurable result", "the alternative", "the risk", "the implementation detail", "the lesson", "the follow-up question"];
  for (let index = 0; cards.length < target; index += 1) {
    const requirement = requirements[index % requirements.length]!;
    const angle = rehearsalAngles[index % rehearsalAngles.length]!;
    add({ front: `For ${requirement.text}, what would you say about ${angle}?`, back: "Use a concise, truthful example from your experience and connect your judgment to the role requirement.", requirement_ids: [requirement.id] });
  }
  return cards;
}

function assertKnownRequirementIds(ids: string[], known: Set<string>, subject: string): void {
  if (ids.some((id) => !known.has(id))) throw new PipelineError("GENERATION_INVALID", `A ${subject} referenced an unknown requirement id.`);
}

async function emit(observer: PipelineObserver | undefined, step: PipelineStep, status: "started" | "completed" | "warning" | "failed", message?: string): Promise<void> {
  await observer?.onStep?.({ step, status, ...(message ? { message } : {}) });
}

function createDefaultResearchService(): CompanyResearchService {
  const urlPolicy = createUrlSafetyPolicy({ allowLocalhost: process.env.NODE_ENV !== "production" });
  const fetcher = new SafeTextFetcher({ urlPolicy });
  const robots = new RobotsPolicy(async (rawUrl) => {
    const url = await urlPolicy.assertAllowed(rawUrl);
    const response = await fetch(url, { headers: { "user-agent": "CruxerResearchBot/0.1" }, signal: AbortSignal.timeout(5_000) });
    return response.ok ? await response.text() : undefined;
  });
  return new CompanyResearchService(robots, fetcher, { publicDiscussionSearch: new TavilyPublicDiscussionSearch() });
}
