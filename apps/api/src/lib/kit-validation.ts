import { z } from "zod";

const requirementSchema = z.object({
  id: z.string().min(1), text: z.string().min(1), kind: z.enum(["technical", "behavioural", "domain"]), priority: z.enum(["must", "nice"])
});
const questionSchema = z.object({
  id: z.string().min(1), requirement_ids: z.array(z.string().min(1)), category: z.enum(["technical", "behavioural", "system-design", "company-fit"]), prompt: z.string().min(1), answer_outline: z.string().min(1), difficulty: z.number().int().min(1).max(3)
});
const flashcardSchema = z.object({
  id: z.string().min(1), front: z.string().min(1), back: z.string().min(1), requirement_ids: z.array(z.string().min(1))
});

/** API-local persistence guard. The pipeline/domain schema remains the canonical generator contract. */
export const persistedKitSchema = z.object({
  source: z.object({ company: z.string(), company_url: z.string().url(), role: z.string(), location: z.string(), jd_chars: z.number().int().nonnegative(), researched_at: z.string().datetime({ offset: true }), pages_used: z.array(z.string().url()) }),
  company_brief: z.object({ summary: z.string(), what_they_do: z.string(), sources: z.array(z.string().url()) }),
  role: z.object({ title: z.string(), seniority: z.string(), responsibilities: z.array(z.string()), requirements: z.array(requirementSchema) }),
  questions: z.array(questionSchema),
  flashcards: z.array(flashcardSchema),
  schedule: z.object({ days_available: z.number().int().min(1).max(60), days: z.array(z.object({ day: z.number().int().positive(), focus: z.string().min(1), question_ids: z.array(z.string().min(1)), minutes: z.number().int().nonnegative() })) }),
  coverage: z.object({ uncovered_requirement_ids: z.array(z.string().min(1)), passes: z.number().int().positive() })
}).superRefine((kit, ctx) => {
  const requirementIds = kit.role.requirements.map((item) => item.id);
  const questionIds = kit.questions.map((item) => item.id);
  const flashcardIds = kit.flashcards.map((item) => item.id);
  addDuplicateIssues(ctx, requirementIds, ["role", "requirements"], "requirement");
  addDuplicateIssues(ctx, questionIds, ["questions"], "question");
  addDuplicateIssues(ctx, flashcardIds, ["flashcards"], "flashcard");

  const knownRequirements = new Set(requirementIds);
  const knownQuestions = new Set(questionIds);
  kit.questions.forEach((question, questionIndex) => question.requirement_ids.forEach((id, idIndex) => {
    if (!knownRequirements.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", questionIndex, "requirement_ids", idIndex], message: `Question references unknown requirement id \"${id}\".` });
  }));
  kit.flashcards.forEach((flashcard, flashcardIndex) => flashcard.requirement_ids.forEach((id, idIndex) => {
    if (!knownRequirements.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["flashcards", flashcardIndex, "requirement_ids", idIndex], message: `Flashcard references unknown requirement id \"${id}\".` });
  }));
  if (kit.schedule.days.length !== kit.schedule.days_available) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule", "days"], message: "Schedule must contain exactly days_available days." });
  }
  kit.schedule.days.forEach((day, dayIndex) => {
    if (day.day !== dayIndex + 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule", "days", dayIndex, "day"], message: "Schedule day numbers must be consecutive starting at 1." });
    day.question_ids.forEach((id, idIndex) => {
      if (!knownQuestions.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule", "days", dayIndex, "question_ids", idIndex], message: `Schedule references unknown question id \"${id}\".` });
    });
  });
  const covered = new Set(kit.questions.flatMap((question) => question.requirement_ids));
  const expectedUncovered = requirementIds.filter((id) => !covered.has(id));
  if (kit.coverage.uncovered_requirement_ids.length !== expectedUncovered.length || !kit.coverage.uncovered_requirement_ids.every((id) => expectedUncovered.includes(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coverage", "uncovered_requirement_ids"], message: "Coverage must be derived from question requirement_ids." });
  }
});

function addDuplicateIssues(ctx: z.RefinementCtx, values: string[], path: Array<string | number>, label: string): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `Duplicate ${label} id(s): ${[...new Set(duplicates)].join(", ")}.` });
}

export type PersistedKitPayload = z.infer<typeof persistedKitSchema>;
