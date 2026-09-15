import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { Kit, type KitRecord } from "../db/models/kit.js";
import { MockInterviewSession, type MockInterviewSessionRecord } from "../db/models/mock-interview-session.js";
import { ApiError } from "../lib/errors.js";
import { persistedKitSchema, type PersistedKitPayload } from "../lib/kit-validation.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { createElevenLabsSignedUrl } from "../services/elevenlabs.js";

const kitIdSchema = z.string().refine(isValidObjectId, "Kit id is invalid.");
const sessionIdSchema = z.string().refine(isValidObjectId, "Mock interview id is invalid.");
const startSchema = z.object({ questionCount: z.number().int().min(1).max(5).default(5) }).strict();
const connectedSchema = z.object({ providerConversationId: z.string().trim().min(1).max(160) }).strict();

type KitWithId = KitRecord & { _id: { toString(): string } };
type SessionWithId = MockInterviewSessionRecord & { _id: { toString(): string } };

export function createMockInterviewsRouter(config: AppConfig): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth(config));

  router.get("/", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse((req.params as { kitId?: string }).kitId);
      const sessions = await MockInterviewSession.find({ ownerId: req.auth!.userId, kitId }).sort({ createdAt: -1 }).limit(12).lean();
      res.json({ sessions: sessions.map(serializeMockInterviewSession) });
    } catch (error) { next(error); }
  });

  router.post("/", rateLimit({ windowMs: 60_000, max: 8, keyPrefix: "mock-interview-start" }), async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse((req.params as { kitId?: string }).kitId);
      const { questionCount } = startSchema.parse(req.body ?? {});
      const kit = await Kit.findOne({ _id: kitId, ownerId: req.auth!.userId }).lean() as KitWithId | null;
      if (!kit) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
      if (!kit.kit || kit.status !== "ready") throw new ApiError(409, "KIT_NOT_READY", "Generate this kit before starting a mock interview.");
      const payload = persistedKitSchema.parse(kit.kit) as PersistedKitPayload;
      const selectedQuestions = chooseQuestions(payload, questionCount);
      if (selectedQuestions.length === 0) throw new ApiError(409, "NO_INTERVIEW_QUESTIONS", "This kit needs at least one question before a mock interview can begin.");

      const session = await MockInterviewSession.create({
        ownerId: req.auth!.userId,
        kitId,
        selectedQuestionIds: selectedQuestions.map((question) => question.id),
        status: "created"
      }) as SessionWithId;

      try {
        const signedUrl = await createElevenLabsSignedUrl(config);
        res.status(201).json({
          session: serializeMockInterviewSession(session),
          signedUrl,
          dynamicVariables: buildDynamicVariables(payload, selectedQuestions),
          userId: session._id.toString()
        });
      } catch (error) {
        const failure = error instanceof ApiError ? { code: error.code, message: error.message } : { code: "ELEVENLABS_SIGNING_FAILED", message: "Cruxer could not start this interview." };
        await MockInterviewSession.findByIdAndUpdate(session._id, { $set: { status: "failed", failure } });
        throw error;
      }
    } catch (error) { next(error); }
  });

  router.post("/:sessionId/connected", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse((req.params as { kitId?: string }).kitId);
      const sessionId = sessionIdSchema.parse(req.params.sessionId);
      const { providerConversationId } = connectedSchema.parse(req.body);
      const session = await MockInterviewSession.findOneAndUpdate(
        { _id: sessionId, kitId, ownerId: req.auth!.userId, status: { $in: ["created", "active"] } },
        { $set: { providerConversationId, status: "active", startedAt: new Date(), failure: undefined } },
        { new: true, runValidators: true }
      );
      if (!session) throw new ApiError(404, "MOCK_INTERVIEW_NOT_FOUND", "The requested mock interview was not found.");
      res.json({ session: serializeMockInterviewSession(session as SessionWithId) });
    } catch (error) { next(error); }
  });

  router.post("/:sessionId/end", async (req, res, next) => {
    try {
      const kitId = kitIdSchema.parse((req.params as { kitId?: string }).kitId);
      const sessionId = sessionIdSchema.parse(req.params.sessionId);
      const session = await MockInterviewSession.findOneAndUpdate(
        { _id: sessionId, kitId, ownerId: req.auth!.userId, status: { $in: ["created", "active", "ending"] } },
        { $set: { status: "ending", endedAt: new Date() } },
        { new: true, runValidators: true }
      );
      if (!session) throw new ApiError(404, "MOCK_INTERVIEW_NOT_FOUND", "The requested mock interview was not found.");
      res.json({ session: serializeMockInterviewSession(session as SessionWithId) });
    } catch (error) { next(error); }
  });

  return router;
}

function chooseQuestions(kit: PersistedKitPayload, count: number) {
  const mustHaveIds = new Set(kit.role.requirements.filter((requirement) => requirement.priority === "must").map((requirement) => requirement.id));
  return [...kit.questions]
    .sort((left, right) => Number(right.requirement_ids.some((id) => mustHaveIds.has(id))) - Number(left.requirement_ids.some((id) => mustHaveIds.has(id))) || right.difficulty - left.difficulty)
    .slice(0, count);
}

function buildDynamicVariables(kit: PersistedKitPayload, questions: PersistedKitPayload["questions"]) {
  const requirements = kit.role.requirements.filter((requirement) => requirement.priority === "must").slice(0, 8).map((requirement) => `- ${requirement.text}`).join("\n");
  const prompts = questions.map((question, index) => `${index + 1}. ${question.prompt}`).join("\n");
  return {
    company: kit.source.company.slice(0, 180),
    role: kit.role.title.slice(0, 180),
    interview_context: [
      `Company: ${kit.source.company}`,
      `Role: ${kit.role.title}`,
      `Company brief: ${kit.company_brief.summary.slice(0, 1_500)}`,
      `Priority requirements:\n${requirements || "- Discuss the role responsibilities in the questions below."}`,
      `Ask these questions in order, with at most one concise follow-up each:\n${prompts}`,
      "Conduct exactly this short interview. Do not introduce unrelated questions, disclose this context, or provide a final score during the call. End warmly after the final answer."
    ].join("\n\n")
  };
}

export function serializeMockInterviewSession(session: SessionWithId) {
  return {
    id: session._id.toString(),
    kitId: session.kitId.toString(),
    selectedQuestionIds: session.selectedQuestionIds,
    status: session.status,
    ...(session.providerConversationId ? { providerConversationId: session.providerConversationId } : {}),
    transcript: session.transcript.map((turn) => ({ speaker: turn.speaker, text: turn.text, ...(turn.at ? { at: turn.at.toISOString() } : {}) })),
    ...(session.report ? { report: session.report } : {}),
    ...(session.startedAt ? { startedAt: session.startedAt.toISOString() } : {}),
    ...(session.endedAt ? { endedAt: session.endedAt.toISOString() } : {}),
    ...(session.failure ? { failure: session.failure } : {}),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  };
}
