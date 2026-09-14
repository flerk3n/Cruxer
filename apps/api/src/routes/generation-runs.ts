import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { GenerationRun, type GenerationRunRecord } from "../db/models/generation-run.js";
import { ApiError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";

const runIdSchema = z.string().refine(isValidObjectId, "Generation run id is invalid.");
type PersistedRun = GenerationRunRecord & { _id: { toString(): string } };

/** Read-only polling endpoint. Generation orchestration creates and updates these records. */
export function createGenerationRunsRouter(config: AppConfig): Router {
  const router = Router();
  router.use(requireAuth(config));

  router.get("/:runId", async (req, res, next) => {
    try {
      const runId = runIdSchema.parse(req.params.runId);
      const run = await GenerationRun.findOne({ _id: runId, ownerId: req.auth!.userId });
      if (!run) throw new ApiError(404, "GENERATION_RUN_NOT_FOUND", "The requested generation run was not found.");
      res.json({ generationRun: serializeGenerationRun(run) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function serializeGenerationRun(run: PersistedRun): Record<string, unknown> {
  return {
    id: run._id.toString(),
    ...(run.kitId ? { kitId: run.kitId.toString() } : {}),
    status: run.status,
    steps: run.steps.map((step) => ({
      name: step.name,
      status: step.status,
      ...(step.message ? { message: step.message } : {}),
      ...(step.startedAt ? { startedAt: step.startedAt.toISOString() } : {}),
      ...(step.completedAt ? { completedAt: step.completedAt.toISOString() } : {})
    })),
    warnings: run.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      ...(warning.step ? { step: warning.step } : {})
    })),
    retryCount: run.retryCount,
    ...(run.terminalError ? { terminalError: run.terminalError } : {}),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString()
  };
}
