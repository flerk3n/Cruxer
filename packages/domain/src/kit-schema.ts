import { z } from "zod";

export const requirementKindSchema = z.enum(["technical", "behavioural", "domain"]);
export const prioritySchema = z.enum(["must", "nice"]);
export const questionCategorySchema = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit"
]);

export const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: requirementKindSchema,
  priority: prioritySchema
});

export const questionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string().min(1)),
  category: questionCategorySchema,
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  difficulty: z.number().int().min(1).max(3)
});

export const flashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string().min(1))
});

export const scheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string().min(1),
  question_ids: z.array(z.string().min(1)),
  minutes: z.number().int().nonnegative()
});

export const kitSchema = z
  .object({
    source: z.object({
      company: z.string(),
      company_url: z.string().url(),
      role: z.string(),
      location: z.string(),
      jd_chars: z.number().int().nonnegative(),
      researched_at: z.string().datetime({ offset: true }),
      pages_used: z.array(z.string().url())
    }),
    company_brief: z.object({
      summary: z.string(),
      what_they_do: z.string(),
      sources: z.array(z.string().url())
    }),
    role: z.object({
      title: z.string(),
      seniority: z.string(),
      responsibilities: z.array(z.string()),
      requirements: z.array(requirementSchema)
    }),
    questions: z.array(questionSchema),
    flashcards: z.array(flashcardSchema),
    schedule: z.object({
      days_available: z.number().int().min(1).max(60),
      days: z.array(scheduleDaySchema)
    }),
    coverage: z.object({
      uncovered_requirement_ids: z.array(z.string().min(1)),
      passes: z.number().int().positive()
    })
  })
  .superRefine((kit, ctx) => {
    const requirementIds = kit.role.requirements.map((requirement) => requirement.id);
    const questionIds = kit.questions.map((question) => question.id);
    const flashcardIds = kit.flashcards.map((flashcard) => flashcard.id);

    addDuplicateIssue(ctx, requirementIds, ["role", "requirements"], "requirement");
    addDuplicateIssue(ctx, questionIds, ["questions"], "question");
    addDuplicateIssue(ctx, flashcardIds, ["flashcards"], "flashcard");

    const knownRequirements = new Set(requirementIds);
    const knownQuestions = new Set(questionIds);

    kit.questions.forEach((question, questionIndex) => {
      question.requirement_ids.forEach((requirementId, requirementIndex) => {
        if (!knownRequirements.has(requirementId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", questionIndex, "requirement_ids", requirementIndex],
            message: `Question references unknown requirement id \"${requirementId}\".`
          });
        }
      });
    });

    kit.flashcards.forEach((flashcard, flashcardIndex) => {
      flashcard.requirement_ids.forEach((requirementId, requirementIndex) => {
        if (!knownRequirements.has(requirementId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["flashcards", flashcardIndex, "requirement_ids", requirementIndex],
            message: `Flashcard references unknown requirement id \"${requirementId}\".`
          });
        }
      });
    });

    if (kit.schedule.days.length !== kit.schedule.days_available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedule", "days"],
        message: "Schedule must contain exactly days_available days."
      });
    }

    kit.schedule.days.forEach((day, dayIndex) => {
      if (day.day !== dayIndex + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["schedule", "days", dayIndex, "day"],
          message: "Schedule day numbers must be consecutive starting at 1."
        });
      }

      day.question_ids.forEach((questionId, questionIndex) => {
        if (!knownQuestions.has(questionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["schedule", "days", dayIndex, "question_ids", questionIndex],
            message: `Schedule references unknown question id \"${questionId}\".`
          });
        }
      });
    });

    const expectedUncovered = calculateUncoveredRequirementIds(
      kit.role.requirements,
      kit.questions
    );
    if (!sameIdSet(kit.coverage.uncovered_requirement_ids, expectedUncovered)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverage", "uncovered_requirement_ids"],
        message: "Coverage must be derived from question requirement_ids."
      });
    }
  });

function addDuplicateIssue(
  ctx: z.RefinementCtx,
  values: string[],
  path: Array<string | number>,
  label: string
): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `Duplicate ${label} id(s): ${[...new Set(duplicates)].join(", ")}.`
    });
  }
}

function sameIdSet(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((id) => expected.includes(id));
}

export function calculateUncoveredRequirementIds(
  requirements: Array<z.infer<typeof requirementSchema>>,
  questions: Array<Pick<z.infer<typeof questionSchema>, "requirement_ids">>
): string[] {
  const coveredIds = new Set(questions.flatMap((question) => question.requirement_ids));
  return requirements.filter((requirement) => !coveredIds.has(requirement.id)).map((requirement) => requirement.id);
}

export type Kit = z.infer<typeof kitSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;
