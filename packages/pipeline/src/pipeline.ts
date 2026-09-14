import { buildSchedule, calculateUncoveredRequirementIds, kitSchema, type Flashcard, type Kit, type Question, type Requirement } from "@cruxer/domain";
import { CompanyResearchService, type ResearchDocument } from "./company-research";
import { PipelineError } from "./errors";
import { flashcardBatchSchema, jsonSchemas, questionBatchSchema, roleExtractionSchema, companyBriefSchema } from "./generation-schemas";
import { GeminiJsonGenerator, type JsonGenerator } from "./gemini";
import { pipelineInputSchema, type PipelineInput } from "./input-schema";
import { companyBriefPrompt, flashcardsPrompt, questionsPrompt, roleExtractionPrompt } from "./prompts";
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

    await emit(observer, "research", "started");
    const research = await this.research.research(input.company_url);
    for (const warning of research.warnings) await emit(observer, "research", "warning", warning.message);
    await emit(observer, "research", "completed");

    await emit(observer, "role", "started");
    const extracted = await this.generator.generate({ prompt: roleExtractionPrompt(input.jd), schema: roleExtractionSchema, responseJsonSchema: jsonSchemas.role });
    const requirements = materializeRequirements(extracted.requirements, input.jd);
    await emit(observer, "role", "completed", requirements.length === 0 ? "The posting contained few explicit requirements." : undefined);
    const role = { title: extracted.title, seniority: extracted.seniority, responsibilities: extracted.responsibilities, requirements };

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
    const result = await this.generator.generate({ prompt: flashcardsPrompt({ requirements: requirements.map(({ id, text }) => ({ id, text })), questions }), schema: flashcardBatchSchema, responseJsonSchema: jsonSchemas.flashcards });
    const known = new Set(requirements.map((requirement) => requirement.id));
    return result.flashcards.map((flashcard, index) => {
      assertKnownRequirementIds(flashcard.requirement_ids, known, "flashcard");
      return { ...flashcard, id: `fc-${index + 1}` };
    });
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
    // JD evidence is a code-owned guard against prompt-injected or fabricated requirements.
    if (!jd.includes(candidate.evidence)) continue;
    const key = candidate.text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({ id: `req-${requirements.length + 1}`, text: candidate.text, kind: candidate.kind, priority: candidate.priority });
  }
  return requirements;
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
  return new CompanyResearchService(robots, fetcher);
}
