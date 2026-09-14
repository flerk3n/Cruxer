import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { Kit, type BuilderEditorState, type KitRecord } from "../db/models/kit.js";
import { PracticeProgress } from "../db/models/practice-progress.js";
import { StudyActivity } from "../db/models/study-activity.js";
import { normalizeEditor, rebuildQuestionDerivedFields } from "../lib/builder.js";
import { ApiError } from "../lib/errors.js";
import { persistedKitSchema, type PersistedKitPayload } from "../lib/kit-validation.js";
import { confidenceScore } from "../lib/practice-score.js";
import {
  DEFAULT_ACTIVITY_DAYS,
  DEFAULT_TIME_ZONE,
  MAX_ACTIVITY_DAYS,
  assertTimeZone,
  addCalendarDays,
  buildActivitySeries,
  buildScheduleSummary,
  calendarDayAt
} from "../lib/study-activity.js";
import { requireAuth } from "../middleware/auth.js";
import { type GenerationInput, type GenerationOrchestrator } from "../services/generation-orchestrator.js";

const kitIdSchema = z.string().refine(isValidObjectId, "Kit id is invalid.");

// Full document replacement is intentional: every persisted kit is revalidated against
// the Appendix A contract instead of accepting unvalidated nested patch fragments.
const generationInputSchema = z.object({
  jd: z.string().trim().min(1, "A job description is required.").max(50_000),
  companyUrl: z.string().trim().url().max(2_048).superRefine((value, ctx) => {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company URL must use HTTP or HTTPS." });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company URL cannot contain credentials." });
    }
  }),
  days: z.number().int().min(1).max(60)
}).strict();

const createKitSchema = z.union([
  generationInputSchema,
  z.object({ kit: persistedKitSchema, inputHash: z.string().trim().min(1).max(128).optional() }).strict()
]);

const updateKitSchema = z
  .object({
    revision: z.number().int().min(0),
    kit: persistedKitSchema
  })
  .strict();

const questionCategorySchema = z.enum(["technical", "behavioural", "system-design", "company-fit"]);
const questionInputSchema = z.object({
  id: z.string().trim().min(1).max(160),
  requirement_ids: z.array(z.string().trim().min(1).max(160)).max(30),
  category: questionCategorySchema,
  prompt: z.string().trim().min(1).max(8_000),
  answer_outline: z.string().trim().min(1).max(12_000),
  difficulty: z.number().int().min(1).max(3)
}).strict();
const flashcardInputSchema = z.object({
  id: z.string().trim().min(1).max(160),
  front: z.string().trim().min(1).max(4_000),
  back: z.string().trim().min(1).max(8_000),
  requirement_ids: z.array(z.string().trim().min(1).max(160)).max(30)
}).strict();
const revisionSchema = z.object({ revision: z.number().int().min(0) }).strict();
const questionPatchSchema = questionInputSchema.omit({ id: true }).partial().extend({
  revision: z.number().int().min(0),
  pinned: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).some((key) => key !== "revision"), "Provide a question field or pinned state.");
const flashcardPatchSchema = flashcardInputSchema.omit({ id: true }).partial().extend({ revision: z.number().int().min(0) }).strict()
  .refine((value) => Object.keys(value).some((key) => key !== "revision"), "Provide a flashcard field.");
const addQuestionSchema = z.object({ revision: z.number().int().min(0), question: questionInputSchema }).strict();
const addFlashcardSchema = z.object({ revision: z.number().int().min(0), flashcard: flashcardInputSchema }).strict();
const reorderQuestionsSchema = z.object({ revision: z.number().int().min(0), questionIds: z.array(z.string().trim().min(1)).max(100) }).strict();
const companyBriefPatchSchema = z.object({
  revision: z.number().int().min(0),
  summary: z.string().trim().min(1).max(12_000).optional(),
  what_they_do: z.string().trim().min(1).max(8_000).optional()
}).strict().refine((value) => value.summary !== undefined || value.what_they_do !== undefined, "Provide a company brief field.");
const regenerateSchema = z.object({
  revision: z.number().int().min(0),
  section: z.enum(["questions", "flashcards", "company-brief", "schedule"]),
  category: questionCategorySchema.optional()
}).strict().superRefine((value, ctx) => {
  if (value.category && value.section !== "questions") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: "A category can only be used when regenerating questions." });
});
const timeZoneSchema = z.string().trim().min(1).max(80).transform((value, ctx) => {
  try { return assertTimeZone(value); } catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use a valid IANA time zone, such as Asia/Kolkata." }); return z.NEVER; }
});
const practiceConfidenceSchema = z.object({
  revision: z.number().int().min(0),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  timeZone: timeZoneSchema.optional()
}).strict();
const activityQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(MAX_ACTIVITY_DAYS).default(DEFAULT_ACTIVITY_DAYS),
  timeZone: timeZoneSchema.default(DEFAULT_TIME_ZONE)
}).strict();
const checkInSchema = z.object({ timeZone: timeZoneSchema.optional() }).strict();

type PersistedKit = KitRecord & { _id: { toString(): string } };

export function createKitsRouter(config: AppConfig, generation: GenerationOrchestrator): Router {
  const router = Router();
  router.use(requireAuth(config));

  router.get("/", async (req, res, next) => {
    try {
      const kits = await Kit.find({ ownerId: req.auth!.userId })
        .sort({ updatedAt: -1 })
        .select("status revision generationRunId createdAt updatedAt kit.source kit.role.title generationInput")
        .lean();

      res.json({ kits: kits.map(serializeKitSummary) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const input = createKitSchema.parse(req.body);
      const created = "kit" in input
        ? await Kit.create({
            ownerId: req.auth!.userId,
            kit: input.kit,
            status: "draft",
            revision: 0,
            inputHash: input.inputHash ?? "manual"
          })
        : await Kit.create({
            ownerId: req.auth!.userId,
            generationInput: input,
            status: "draft",
            revision: 0,
            // This preliminary value is replaced with the canonical content hash when
            // generation is actually reserved, avoiding duplicate in-flight runs.
            inputHash: "pending"
          });

      res.status(201).json({ kit: serializeKit(created) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:kitId", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const kit = await Kit.findOne({ _id: kitId, ownerId: req.auth!.userId });
      if (!kit) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");

      res.json({ kit: serializeKit(kit) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:kitId", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const { revision, kit } = updateKitSchema.parse(req.body);
      const updated = await Kit.findOneAndUpdate(
        { _id: kitId, ownerId: req.auth!.userId, revision },
        { $set: { kit }, $inc: { revision: 1 } },
        { new: true, runValidators: true }
      );

      if (!updated) {
        const exists = await Kit.exists({ _id: kitId, ownerId: req.auth!.userId });
        if (!exists) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
        throw new ApiError(409, "REVISION_CONFLICT", "This kit has changed. Reload it before saving again.");
      }

      res.json({ kit: serializeKit(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:kitId/company-brief", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const input = companyBriefPatchSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, input.revision, (draft) => {
        const { revision: _revision, ...brief } = input;
        return { ...draft, company_brief: { ...draft.company_brief, ...brief } };
      });
      res.json({ kit: serializeKit(kit) });
    } catch (error) { next(error); }
  });

  router.post("/:kitId/questions", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const { revision, question } = addQuestionSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, revision, (draft, editor) => {
        if (draft.questions.some((item) => item.id === question.id)) throw new ApiError(409, "QUESTION_EXISTS", "A question with this id already exists.");
        draft.questions.push(question);
        editor.questions[question.id] = { manual: true, edited: false, pinned: false };
        return rebuildQuestionDerivedFields(draft);
      });
      res.status(201).json({ kit: serializeKit(kit) });
    } catch (error) { next(error); }
  });

  router.post("/:kitId/questions/reorder", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const { revision, questionIds } = reorderQuestionsSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, revision, (draft) => {
        const currentIds = draft.questions.map((question) => question.id);
        const valid = questionIds.length === currentIds.length && new Set(questionIds).size === questionIds.length && questionIds.every((id) => currentIds.includes(id));
        if (!valid) throw new ApiError(400, "INVALID_QUESTION_ORDER", "questionIds must contain every current question exactly once.");
        const byId = new Map(draft.questions.map((question) => [question.id, question]));
        draft.questions = questionIds.map((id) => byId.get(id)!);
        return rebuildQuestionDerivedFields(draft);
      });
      res.json({ kit: serializeKit(kit) });
    } catch (error) { next(error); }
  });

  router.patch("/:kitId/questions/:questionId", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const questionId = z.string().trim().min(1).parse(req.params.questionId);
      const input = questionPatchSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, input.revision, (draft, editor) => {
        const index = draft.questions.findIndex((question) => question.id === questionId);
        if (index < 0) throw new ApiError(404, "QUESTION_NOT_FOUND", "The requested question was not found.");
        const { revision: _revision, pinned, ...patch } = input;
        draft.questions[index] = { ...draft.questions[index]!, ...patch };
        const state = editor.questions[questionId] ?? { manual: false, edited: false, pinned: false };
        editor.questions[questionId] = {
          ...state,
          ...(pinned === undefined ? {} : { pinned }),
          ...(Object.keys(patch).length ? { edited: true } : {})
        };
        return rebuildQuestionDerivedFields(draft);
      });
      res.json({ kit: serializeKit(kit) });
    } catch (error) { next(error); }
  });

  router.delete("/:kitId/questions/:questionId", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const questionId = z.string().trim().min(1).parse(req.params.questionId);
      const { revision } = revisionSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, revision, (draft, editor) => {
        const questions = draft.questions.filter((question) => question.id !== questionId);
        if (questions.length === draft.questions.length) throw new ApiError(404, "QUESTION_NOT_FOUND", "The requested question was not found.");
        draft.questions = questions;
        delete editor.questions[questionId];
        return rebuildQuestionDerivedFields(draft);
      });
      res.json({ kit: serializeKit(kit) });
    } catch (error) { next(error); }
  });

  router.post("/:kitId/flashcards", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const { revision, flashcard } = addFlashcardSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, revision, (draft) => {
        if (draft.flashcards.some((item) => item.id === flashcard.id)) throw new ApiError(409, "FLASHCARD_EXISTS", "A flashcard with this id already exists.");
        draft.flashcards.push(flashcard);
        return draft;
      });
      res.status(201).json({ kit: serializeKit(kit) });
    } catch (error) { next(error); }
  });

  router.patch("/:kitId/flashcards/:flashcardId", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const flashcardId = z.string().trim().min(1).parse(req.params.flashcardId);
      const input = flashcardPatchSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, input.revision, (draft) => {
        const index = draft.flashcards.findIndex((flashcard) => flashcard.id === flashcardId);
        if (index < 0) throw new ApiError(404, "FLASHCARD_NOT_FOUND", "The requested flashcard was not found.");
        const { revision: _revision, ...patch } = input;
        draft.flashcards[index] = { ...draft.flashcards[index]!, ...patch };
        return draft;
      });
      res.json({ kit: serializeKit(kit) });
    } catch (error) { next(error); }
  });

  router.delete("/:kitId/flashcards/:flashcardId", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const flashcardId = z.string().trim().min(1).parse(req.params.flashcardId);
      const { revision } = revisionSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, revision, (draft) => {
        const flashcards = draft.flashcards.filter((flashcard) => flashcard.id !== flashcardId);
        if (flashcards.length === draft.flashcards.length) throw new ApiError(404, "FLASHCARD_NOT_FOUND", "The requested flashcard was not found.");
        draft.flashcards = flashcards;
        return draft;
      });
      await PracticeProgress.deleteMany({ ownerId: req.auth!.userId, kitId, flashcardId });
      res.json({ kit: serializeKit(kit) });
    } catch (error) { next(error); }
  });

  router.post("/:kitId/regenerate", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const request = regenerateSchema.parse(req.body);
      const result = await generation.regenerate(req.auth!.userId, kitId, request);
      res.status(202).json({ kit: serializeKit(result.kit), generationRun: result.generationRun });
    } catch (error) { next(error); }
  });

  router.get("/:kitId/practice", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const exists = await Kit.exists({ _id: kitId, ownerId: req.auth!.userId });
      if (!exists) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
      const progress = await PracticeProgress.find({ ownerId: req.auth!.userId, kitId }).sort({ updatedAt: -1 }).lean();
      res.json({ progress: progress.map(serializePracticeProgress) });
    } catch (error) { next(error); }
  });

  router.post("/:kitId/practice/:flashcardId", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const flashcardId = z.string().trim().min(1).parse(req.params.flashcardId);
      const { revision, confidence, timeZone = DEFAULT_TIME_ZONE } = practiceConfidenceSchema.parse(req.body);
      const kit = await mutateKit(req.auth!.userId, kitId, revision, (draft) => {
        if (!draft.flashcards.some((flashcard) => flashcard.id === flashcardId)) throw new ApiError(404, "FLASHCARD_NOT_FOUND", "The requested flashcard was not found.");
        return draft;
      });
      const progress = await PracticeProgress.findOneAndUpdate(
        { ownerId: req.auth!.userId, kitId, flashcardId },
        { $set: { lastConfidence: confidence, confidenceScore: confidenceScore(confidence), lastReviewedAt: new Date() }, $inc: { attempts: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
      await recordFlashcardActivity(req.auth!.userId, kitId, confidence, timeZone);
      res.json({ kit: serializeKit(kit), progress: serializePracticeProgress(progress) });
    } catch (error) { next(error); }
  });

  router.get("/:kitId/activity", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const { days, timeZone } = activityQuerySchema.parse(req.query);
      const kit = await Kit.findOne({ _id: kitId, ownerId: req.auth!.userId }).select("kit createdAt").lean();
      if (!kit) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");

      const todayDate = calendarDayAt(new Date(), timeZone);
      const from = addCalendarDays(todayDate, -(days - 1));
      const activity = await StudyActivity.find({
        ownerId: req.auth!.userId,
        kitId,
        day: { $gte: from, $lte: todayDate }
      }).select("day flashcardReviews lowConfidenceReviews mediumConfidenceReviews highConfidenceReviews checkedIn").lean();
      const series = buildActivitySeries(from, days, activity);

      res.json({
        timeZone,
        range: { from, to: todayDate, days },
        series,
        today: series.at(-1),
        schedule: buildScheduleSummary(kit.kit as PersistedKitPayload | undefined, kit.createdAt, todayDate, timeZone)
      });
    } catch (error) { next(error); }
  });

  router.post("/:kitId/activity/check-in", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const { timeZone = DEFAULT_TIME_ZONE } = checkInSchema.parse(req.body);
      const exists = await Kit.exists({ _id: kitId, ownerId: req.auth!.userId });
      if (!exists) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
      const day = calendarDayAt(new Date(), timeZone);
      const activity = await StudyActivity.findOneAndUpdate(
        { ownerId: req.auth!.userId, kitId, day },
        { $set: { checkedIn: true } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      ).lean();
      res.status(201).json({ activity: serializeActivityDay(activity) });
    } catch (error) { next(error); }
  });

  router.post("/:kitId/generate", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse(req.params.kitId);
      const generationRun = await generation.start(req.auth!.userId, kitId);
      res.status(202).json({ generationRun });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function serializeKit(kit: PersistedKit): {
  id: string;
  kit?: PersistedKitPayload;
  generationInput?: GenerationInput;
  status: KitRecord["status"];
  generationRunId?: string;
  editor?: BuilderEditorState;
  revision: number;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: kit._id.toString(),
    ...(kit.kit ? { kit: kit.kit as PersistedKitPayload } : {}),
    ...(kit.generationInput ? { generationInput: kit.generationInput } : {}),
    status: kit.status,
    ...(kit.generationRunId ? { generationRunId: kit.generationRunId.toString() } : {}),
    ...(kit.editor ? { editor: kit.editor } : {}),
    revision: kit.revision,
    createdAt: kit.createdAt.toISOString(),
    updatedAt: kit.updatedAt.toISOString()
  };
}

function serializeKitSummary(kit: Record<string, unknown>): Record<string, unknown> {
  const rawKit = kit.kit as { source?: { company?: string }; role?: { title?: string } } | undefined;
  const generationInput = kit.generationInput as GenerationInput | undefined;
  const generationRunId = kit.generationRunId as { toString(): string } | undefined;
  return {
    id: String(kit._id),
    status: kit.status,
    revision: kit.revision,
    ...(generationRunId ? { generationRunId: generationRunId.toString() } : {}),
    company: rawKit?.source?.company ?? companyFromUrl(generationInput?.companyUrl),
    roleTitle: rawKit?.role?.title ?? "Draft kit",
    createdAt: new Date(String(kit.createdAt)).toISOString(),
    updatedAt: new Date(String(kit.updatedAt)).toISOString()
  };
}

function companyFromUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  try { return new URL(rawUrl).hostname; } catch { return ""; }
}

/**
 * Mutations work on a complete in-memory kit, validate the Appendix A payload,
 * then use the revision in the update predicate. This gives nested editor writes
 * optimistic concurrency without accepting arbitrary unvalidated Mongo patches.
 */
async function mutateKit(
  ownerId: string,
  kitId: string,
  revision: number,
  mutate: (kit: PersistedKitPayload, editor: BuilderEditorState) => PersistedKitPayload
): Promise<PersistedKit> {
  const current = await Kit.findOne({ _id: kitId, ownerId }).lean();
  if (!current) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
  if (!current.kit) throw new ApiError(409, "KIT_NOT_READY", "Generate this kit before editing its study materials.");
  if (current.status === "generating") throw new ApiError(409, "KIT_GENERATING", "This kit is being generated. Wait for it to finish before editing.");
  if (current.revision !== revision) throw new ApiError(409, "REVISION_CONFLICT", "This kit has changed. Reload it before saving again.");

  const editor = normalizeEditor(current.editor);
  const next = persistedKitSchema.parse(mutate(structuredClone(current.kit) as PersistedKitPayload, editor));
  const updated = await Kit.findOneAndUpdate(
    { _id: kitId, ownerId, revision, status: { $ne: "generating" } },
    { $set: { kit: next, editor }, $inc: { revision: 1 } },
    { new: true, runValidators: true }
  );
  if (updated) return updated as PersistedKit;

  const exists = await Kit.exists({ _id: kitId, ownerId });
  if (!exists) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
  throw new ApiError(409, "REVISION_CONFLICT", "This kit has changed. Reload it before saving again.");
}

function serializePracticeProgress(progress: {
  flashcardId: string;
  lastConfidence?: 1 | 2 | 3;
  confidenceScore?: number;
  attempts: number;
  lastReviewedAt?: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    flashcardId: progress.flashcardId,
    ...(progress.lastConfidence ? { lastConfidence: progress.lastConfidence } : {}),
    confidenceScore: progress.confidenceScore ?? confidenceScore(progress.lastConfidence ?? 1),
    attempts: progress.attempts,
    ...(progress.lastReviewedAt ? { lastReviewedAt: progress.lastReviewedAt.toISOString() } : {}),
    updatedAt: progress.updatedAt.toISOString()
  };
}

async function recordFlashcardActivity(ownerId: string, kitId: string, confidence: 1 | 2 | 3, timeZone: string): Promise<void> {
  const confidenceField = confidence === 1 ? "lowConfidenceReviews" : confidence === 2 ? "mediumConfidenceReviews" : "highConfidenceReviews";
  await StudyActivity.findOneAndUpdate(
    { ownerId, kitId, day: calendarDayAt(new Date(), timeZone) },
    { $inc: { flashcardReviews: 1, [confidenceField]: 1 } },
    { upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

function serializeActivityDay(activity: {
  day: string;
  flashcardReviews: number;
  lowConfidenceReviews: number;
  mediumConfidenceReviews: number;
  highConfidenceReviews: number;
  checkedIn: boolean;
}) {
  return buildActivitySeries(activity.day, 1, [activity])[0]!;
}
