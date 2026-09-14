import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

export const roleExtractionSchema = z.object({
  title: nonEmpty,
  seniority: nonEmpty,
  location: z.string().trim(),
  responsibilities: z.array(nonEmpty).max(16),
  requirements: z.array(z.object({
    text: nonEmpty,
    kind: z.enum(["technical", "behavioural", "domain"]),
    priority: z.enum(["must", "nice"]),
    /** Exact or normalized JD evidence. It is never persisted in the kit. */
    evidence: nonEmpty
  })).max(24)
});

export const companyBriefSchema = z.object({
  summary: nonEmpty,
  what_they_do: nonEmpty
});

export const generatedQuestionSchema = z.object({
  requirement_ids: z.array(nonEmpty).min(1).max(4),
  prompt: nonEmpty,
  answer_outline: nonEmpty,
  difficulty: z.number().int().min(1).max(3)
});

export const questionBatchSchema = z.object({ questions: z.array(generatedQuestionSchema).max(16) });

export const generatedFlashcardSchema = z.object({
  front: nonEmpty,
  back: nonEmpty,
  requirement_ids: z.array(nonEmpty).min(1).max(3)
});

export const flashcardBatchSchema = z.object({ flashcards: z.array(generatedFlashcardSchema).max(30) });

/** JSON Schema is deliberately compact; runtime Zod checks are the final guard. */
export const jsonSchemas = {
  role: objectSchema({ title: stringSchema(), seniority: stringSchema(), location: stringSchema(), responsibilities: arraySchema(stringSchema()), requirements: arraySchema(objectSchema({ text: stringSchema(), kind: enumSchema(["technical", "behavioural", "domain"]), priority: enumSchema(["must", "nice"]), evidence: stringSchema() }, ["text", "kind", "priority", "evidence"])) }, ["title", "seniority", "location", "responsibilities", "requirements"]),
  brief: objectSchema({ summary: stringSchema(), what_they_do: stringSchema() }, ["summary", "what_they_do"]),
  questions: objectSchema({ questions: arraySchema(objectSchema({ requirement_ids: arraySchema(stringSchema()), prompt: stringSchema(), answer_outline: stringSchema(), difficulty: { type: "integer", minimum: 1, maximum: 3 } }, ["requirement_ids", "prompt", "answer_outline", "difficulty"])) }, ["questions"]),
  flashcards: objectSchema({ flashcards: arraySchema(objectSchema({ front: stringSchema(), back: stringSchema(), requirement_ids: arraySchema(stringSchema()) }, ["front", "back", "requirement_ids"])) }, ["flashcards"])
} as const;

function stringSchema(): Record<string, unknown> { return { type: "string" }; }
function arraySchema(items: Record<string, unknown>): Record<string, unknown> { return { type: "array", items }; }
function enumSchema(values: string[]): Record<string, unknown> { return { type: "string", enum: values }; }
function objectSchema(properties: Record<string, Record<string, unknown>>, required: string[]): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}
