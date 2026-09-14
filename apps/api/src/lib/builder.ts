import { buildSchedule, calculateUncoveredRequirementIds, type Flashcard, type Question } from "../../../../packages/domain/src/index.js";
import { persistedKitSchema, type PersistedKitPayload } from "./kit-validation.js";
import type { BuilderEditorState } from "../db/models/kit.js";

export type QuestionEditorState = BuilderEditorState["questions"][string];

const emptyQuestionState = (): QuestionEditorState => ({ manual: false, edited: false, pinned: false });

/** Converts historical/malformed Mixed values into a deliberately small safe shape. */
export function normalizeEditor(value: unknown): BuilderEditorState {
  const rawQuestions = isRecord(value) && isRecord(value.questions) ? value.questions : {};
  const questions: BuilderEditorState["questions"] = {};
  for (const [id, state] of Object.entries(rawQuestions)) {
    if (isRecord(state)) {
      questions[id] = {
        manual: state.manual === true,
        edited: state.edited === true,
        pinned: state.pinned === true
      };
    }
  }
  return { questions };
}

export function questionState(editor: BuilderEditorState, id: string): QuestionEditorState {
  return editor.questions[id] ?? emptyQuestionState();
}

export function isProtectedQuestion(editor: BuilderEditorState, id: string): boolean {
  const state = questionState(editor, id);
  return state.manual || state.edited || state.pinned;
}

/** Rebuild every field derived from question content before the persistence guard runs. */
export function rebuildQuestionDerivedFields(kit: PersistedKitPayload): PersistedKitPayload {
  const questions = kit.questions as Question[];
  const requirements = kit.role.requirements;
  return {
    ...kit,
    schedule: buildSchedule(kit.schedule.days_available, questions, requirements),
    coverage: {
      ...kit.coverage,
      uncovered_requirement_ids: calculateUncoveredRequirementIds(requirements, questions)
    }
  };
}

/**
 * Applies a full-pipeline result as a narrow builder regeneration. The original
 * kit remains the source of truth for every section outside `section`.
 */
export function mergeRegeneratedSection(
  current: PersistedKitPayload,
  generated: PersistedKitPayload,
  editor: BuilderEditorState,
  section: "questions" | "flashcards" | "company-brief" | "schedule",
  category?: Question["category"]
): PersistedKitPayload {
  if (section === "flashcards") {
    return persistedKitSchema.parse({ ...current, flashcards: generated.flashcards as Flashcard[] });
  }

  if (section === "company-brief") {
    return persistedKitSchema.parse({ ...current, company_brief: generated.company_brief });
  }

  if (section === "schedule") {
    // Schedules are deterministic and must always reference the user's current
    // questions, including manual and edited material. Do not copy ids from a
    // fresh pipeline run, whose independently generated question ids differ.
    return persistedKitSchema.parse({
      ...current,
      schedule: buildSchedule(current.schedule.days_available, current.questions as Question[], current.role.requirements)
    });
  }

  const existing = current.questions as Question[];
  const candidates = (generated.questions as Question[]).filter((question) => !category || question.category === category);
  const untouched = category ? existing.filter((question) => question.category !== category) : [];
  const protectedQuestions = existing.filter((question) => (!category || question.category === category) && isProtectedQuestion(editor, question.id));
  const protectedIds = new Set(protectedQuestions.map((question) => question.id));
  const merged = [...untouched, ...candidates.filter((question) => !protectedIds.has(question.id)), ...protectedQuestions];

  // Callers prune editor state against the merged IDs before persistence. This parse
  // protects the merge independently from the outer generation orchestration boundary.
  return rebuildQuestionDerivedFields(persistedKitSchema.parse({ ...current, questions: merged }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
