import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { Kit, type KitRecord } from "../db/models/kit.js";
import { ApiError } from "../lib/errors.js";
import { persistedKitSchema, type PersistedKitPayload } from "../lib/kit-validation.js";
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
