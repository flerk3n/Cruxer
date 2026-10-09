import { createHash } from "node:crypto";
import { Types } from "mongoose";
import type { KitPipeline, PipelineStep } from "../../../../packages/pipeline/src/index.js";
import { PipelineError } from "../../../../packages/pipeline/src/index.js";
import { GenerationRun, type GenerationRunRecord } from "../db/models/generation-run.js";
import { Kit, type KitRecord } from "../db/models/kit.js";
import { refundKit, reserveKit, resolvePlan } from "../billing/entitlements.js";
import type { AppConfig } from "../config/env.js";
import { ApiError } from "../lib/errors.js";
import { mergeRegeneratedSection, normalizeEditor } from "../lib/builder.js";
import { persistedKitSchema } from "../lib/kit-validation.js";

export type GenerationInput = { jd: string; companyUrl: string; days: number };

const stepNames = ["input", "research", "role", "questions", "flashcards", "coverage", "schedule", "validation"] as const satisfies readonly PipelineStep[];
const retryableCodes = new Set(["COMPANY_UNREACHABLE", "HTTP_ERROR", "GENERATION_FAILED", "GENERATION_RATE_LIMITED", "GENERATION_INVALID", "GENERATION_UNAVAILABLE", "RESPONSE_TOO_LARGE"]);

/**
 * Persists a durable progress record around the shared pipeline. The pipeline is
 * injected so HTTP tests never invoke Gemini, crawling, or other external I/O.
 */
export class GenerationOrchestrator {
  constructor(
    private readonly pipeline: KitPipeline,
    private readonly config: Pick<AppConfig, "NODE_ENV" | "DEV_GRANT_PRO">
  ) {}

  async start(ownerId: string, kitId: string): Promise<{ id: string; kitId: string }> {
    const kit = await Kit.findOne({ _id: kitId, ownerId }).select("generationInput status").lean();
    if (!kit) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
    if (!kit.generationInput) {
      throw new ApiError(400, "GENERATION_INPUT_REQUIRED", "This draft does not contain the job description, company URL, and days required to generate it.");
    }
    if (kit.status === "generating") {
      throw new ApiError(409, "GENERATION_IN_PROGRESS", "This kit is already being generated.");
    }

    return this.createAttempt(ownerId, kitId, kit.generationInput);
  }

  /** Reserve a revision before expensive work so stale builder edits cannot overwrite a regeneration. */
  async regenerate(
    ownerId: string,
    kitId: string,
    request: { revision: number; section: "questions" | "flashcards" | "company-brief" | "schedule"; category?: "technical" | "behavioural" | "system-design" | "company-fit" }
  ): Promise<{ kit: KitRecord & { _id: { toString(): string } }; generationRun: { id: string; kitId: string } }> {
    const kit = await Kit.findOne({ _id: kitId, ownerId }).select("generationInput status revision kit regenerationCount").lean();
    if (!kit) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
    if (!kit.kit || !kit.generationInput) throw new ApiError(409, "KIT_NOT_READY", "Generate this kit before regenerating a section.");
    if (kit.status === "generating") throw new ApiError(409, "GENERATION_IN_PROGRESS", "This kit is already being generated.");
    if (kit.revision !== request.revision) throw new ApiError(409, "REVISION_CONFLICT", "This kit has changed. Reload it before regenerating.");
    const { plan, limits } = await resolvePlan(ownerId, this.config);
    if ((kit.regenerationCount ?? 0) >= limits.regenerationsPerKit) throw regenerationLimitError(plan, limits.regenerationsPerKit);

    const inputHash = hashInput(kit.generationInput);
    const active = await GenerationRun.exists({ ownerId, inputHash, status: { $in: ["queued", "running"] } });
    if (active) throw new ApiError(409, "GENERATION_IN_PROGRESS", "An identical generation request is already in progress.");
    const runId = new Types.ObjectId();
    const run = await GenerationRun.create({
      _id: runId, ownerId, kitId, inputHash, input: kit.generationInput, status: "queued", steps: initialSteps(), warnings: [], retryCount: 0,
      charge: { kind: "regeneration", refId: `${runId.toString()}:0`, refunded: false },
      regeneration: { section: request.section, ...(request.category ? { category: request.category } : {}) }
    });
    // The fair-use cap is part of the reservation predicate so parallel requests cannot exceed it.
    const reservedKit = await Kit.findOneAndUpdate(
      { _id: kitId, ownerId, revision: request.revision, status: { $ne: "generating" }, ...regenerationCapFilter(limits.regenerationsPerKit) },
      { $set: { status: "generating", generationRunId: run._id, inputHash }, $inc: { revision: 1, regenerationCount: 1 } },
      { new: true, runValidators: true }
    );
    if (!reservedKit) {
      await GenerationRun.deleteOne({ _id: run._id, status: "queued" });
      throw new ApiError(409, "REVISION_CONFLICT", "This kit has changed. Reload it before regenerating.");
    }
    void this.execute(run._id.toString());
    return { kit: reservedKit as KitRecord & { _id: { toString(): string } }, generationRun: { id: run._id.toString(), kitId } };
  }

  async retry(ownerId: string, runId: string): Promise<{ id: string; kitId: string }> {
    const run = await GenerationRun.findOne({ _id: runId, ownerId });
    if (!run) throw new ApiError(404, "GENERATION_RUN_NOT_FOUND", "The requested generation run was not found.");
    if (!run.kitId) throw new ApiError(409, "GENERATION_NOT_RETRYABLE", "This generation run is not attached to a kit.");
    if (run.status === "queued" || run.status === "running") {
      throw new ApiError(409, "GENERATION_IN_PROGRESS", "This generation run is already in progress.");
    }

    const active = await GenerationRun.exists({ ownerId, inputHash: run.inputHash, status: { $in: ["queued", "running"] } });
    if (active) throw new ApiError(409, "GENERATION_IN_PROGRESS", "An identical generation request is already in progress.");

    // The failed attempt was refunded, so a retry is charged like a new attempt.
    const isRegeneration = scopedRegeneration(run.regeneration) !== undefined;
    const refId = `${run._id.toString()}:${run.retryCount + 1}`;
    const { plan, limits } = await resolvePlan(ownerId, this.config);
    const kitCharge = isRegeneration ? undefined : await reserveKit(ownerId, refId, this.config);
    const charge = { kind: isRegeneration ? "regeneration" as const : "kit" as const, refId, ...(kitCharge ? { periodKey: kitCharge.periodKey } : {}), refunded: false };
    const releaseKitCharge = async () => { if (kitCharge) await refundKit(ownerId, refId, kitCharge.periodKey); };

    const queued = await GenerationRun.findOneAndUpdate(
      { _id: run._id, ownerId, status: { $in: ["failed", "retryable"] } },
      {
        $set: { status: "queued", steps: initialSteps(), warnings: [], charge },
        $unset: { terminalError: 1 },
        $inc: { retryCount: 1 }
      },
      { new: true, runValidators: true }
    );
    if (!queued) {
      await releaseKitCharge();
      throw new ApiError(409, "GENERATION_NOT_RETRYABLE", "This generation run cannot be retried.");
    }

    const reservedKit = await Kit.findOneAndUpdate(
      { _id: queued.kitId, ownerId, status: { $ne: "generating" }, ...(isRegeneration ? regenerationCapFilter(limits.regenerationsPerKit) : {}) },
      { $set: { status: "generating", generationRunId: queued._id }, ...(isRegeneration ? { $inc: { regenerationCount: 1 } } : {}) },
      { new: true, runValidators: true }
    );
    if (!reservedKit) {
      await GenerationRun.updateOne({ _id: queued._id, status: "queued" }, { $set: { status: "failed", "charge.refunded": true, terminalError: { code: "KIT_UNAVAILABLE", message: "The kit could not be reserved for generation." } } });
      await releaseKitCharge();
      if (isRegeneration && await Kit.exists({ _id: queued.kitId, ownerId, status: { $ne: "generating" } })) throw regenerationLimitError(plan, limits.regenerationsPerKit);
      throw new ApiError(409, "GENERATION_IN_PROGRESS", "This kit is already being generated.");
    }

    void this.execute(queued._id.toString());
    return { id: queued._id.toString(), kitId: queued.kitId!.toString() };
  }

  private async createAttempt(ownerId: string, kitId: string, input: GenerationInput): Promise<{ id: string; kitId: string }> {
    const inputHash = hashInput(input);
    const existing = await GenerationRun.findOne({ ownerId, inputHash, status: { $in: ["queued", "running"] } }).select("_id kitId").lean();
    if (existing) {
      throw new ApiError(409, "GENERATION_IN_PROGRESS", "An identical generation request is already in progress.", { generationRunId: existing._id.toString(), kitId: existing.kitId?.toString() });
    }

    // Charge before any provider work; every exit path below that does not start a run refunds it.
    const runId = new Types.ObjectId();
    const refId = `${runId.toString()}:0`;
    const { periodKey } = await reserveKit(ownerId, refId, this.config);

    let run: GenerationRunRecord & { _id: { toString(): string } };
    try {
      run = await GenerationRun.create({
        _id: runId, ownerId, kitId, inputHash, input, status: "queued", steps: initialSteps(), warnings: [], retryCount: 0,
        charge: { kind: "kit", refId, periodKey, refunded: false }
      });
    } catch (error) {
      await refundKit(ownerId, refId, periodKey);
      if (isDuplicateKeyError(error)) {
        throw new ApiError(409, "GENERATION_IN_PROGRESS", "An identical generation request is already in progress.");
      }
      throw error;
    }

    const reservedKit = await Kit.findOneAndUpdate(
      { _id: kitId, ownerId, status: { $ne: "generating" } },
      { $set: { status: "generating", generationRunId: run._id, inputHash } },
      { new: true, runValidators: true }
    );
    if (!reservedKit) {
      await GenerationRun.deleteOne({ _id: run._id, status: "queued" });
      await refundKit(ownerId, refId, periodKey);
      throw new ApiError(409, "GENERATION_IN_PROGRESS", "This kit is already being generated.");
    }

    void this.execute(run._id.toString());
    return { id: run._id.toString(), kitId };
  }

  private async execute(runId: string): Promise<void> {
    const run = await GenerationRun.findOneAndUpdate({ _id: runId, status: "queued" }, { $set: { status: "running" } }, { new: true });
    if (!run) return;

    let stage: GenerationStage = "building";
    try {
      const generated = await this.pipeline.run(
        { jd: run.input.jd, company_url: run.input.companyUrl, days: run.input.days },
        { onStep: async (event) => this.recordStep(runId, event) }
      );
      // The pipeline validates its output too; this second boundary protects the database
      // should a future pipeline implementation accidentally loosen that contract.
      stage = "validating-persistence";
      const generatedKit = persistedKitSchema.parse(generated);
      stage = "preparing-save";
      const regeneration = scopedRegeneration(run.regeneration);
      const update = regeneration
        ? await this.mergeRegeneration(run, generatedKit, regeneration)
        : { kit: generatedKit, editor: undefined };
      stage = "saving-kit";
      const saved = await Kit.findOneAndUpdate(
        { _id: run.kitId, ownerId: run.ownerId, generationRunId: run._id },
        {
          $set: {
            kit: update.kit,
            status: "ready",
            ...(update.editor ? { editor: update.editor } : {})
          },
          $inc: { revision: 1 }
        },
        { new: true, runValidators: true }
      );
      if (!saved) throw new Error("The kit generation lease is no longer valid.");
      stage = "marking-run-ready";
      await GenerationRun.updateOne({ _id: run._id }, { $set: { status: "ready" }, $unset: { terminalError: 1 } });
    } catch (error) {
      logGenerationFailure(runId, stage, error);
      const failure = toFailure(error, stage);
      const status = failure.retryable ? "retryable" : "failed";
      await GenerationRun.updateOne(
        { _id: run._id },
        { $set: { status, terminalError: { code: failure.code, message: failure.message } } }
      );
      await Kit.updateOne(
        // Do not turn a successfully saved kit back into a failure if the only
        // remaining operation (marking the run ready) has a transient problem.
        { _id: run.kitId, ownerId: run.ownerId, generationRunId: run._id, status: "generating" },
        { $set: { status: "failed" } }
      );
      await this.failCurrentStep(runId, failure.message);
      // Once the kit is saved the user received it, so only earlier failures are refunded.
      if (stage !== "marking-run-ready") await this.refundCharge(runId);
    }
  }

  /**
   * Users never pay for an attempt that did not produce a kit. The `charge.refunded`
   * flag is claimed atomically, so a refund happens at most once per attempt even if
   * the failure path and the stuck-run sweeper race.
   */
  async refundCharge(runId: string): Promise<void> {
    const run = await GenerationRun.findOneAndUpdate(
      { _id: runId, "charge.refunded": false },
      { $set: { "charge.refunded": true } },
      { new: false }
    ).select("ownerId kitId charge").lean();
    if (!run?.charge) return;
    if (run.charge.kind === "kit" && run.charge.periodKey) {
      await refundKit(run.ownerId.toString(), run.charge.refId, run.charge.periodKey);
    } else if (run.charge.kind === "regeneration" && run.kitId) {
      await Kit.updateOne({ _id: run.kitId, regenerationCount: { $gt: 0 } }, { $inc: { regenerationCount: -1 } });
    }
  }

  private async mergeRegeneration(
    run: GenerationRunRecord & { _id: { toString(): string } },
    generated: ReturnType<typeof persistedKitSchema.parse>,
    regeneration: ScopedRegeneration
  ): Promise<{ kit: ReturnType<typeof persistedKitSchema.parse>; editor: ReturnType<typeof normalizeEditor> }> {
    const current = await Kit.findOne({ _id: run.kitId, ownerId: run.ownerId, generationRunId: run._id }).select("kit editor").lean();
    if (!current?.kit) throw new Error("The kit regeneration lease is no longer valid.");
    const editor = normalizeEditor(current.editor);
    const kit = mergeRegeneratedSection(
      persistedKitSchema.parse(current.kit),
      generated,
      editor,
      regeneration.section,
      regeneration.category
    );
    const validIds = new Set(kit.questions.map((question) => question.id));
    editor.questions = Object.fromEntries(Object.entries(editor.questions).filter(([id]) => validIds.has(id)));
    return { kit, editor };
  }

  private async recordStep(runId: string, event: { step: PipelineStep; status: "started" | "completed" | "warning" | "failed"; message?: string }): Promise<void> {
    const now = new Date();
    const set: Record<string, unknown> = { "steps.$.status": stepStatus(event.status) };
    if (event.message) set["steps.$.message"] = event.message;
    if (event.status === "started") set["steps.$.startedAt"] = now;
    if (event.status === "completed" || event.status === "failed") set["steps.$.completedAt"] = now;
    await GenerationRun.updateOne({ _id: runId, "steps.name": event.step }, { $set: set });
    if (event.status === "warning" && event.message) {
      await GenerationRun.updateOne({ _id: runId }, { $push: { warnings: { code: "PIPELINE_WARNING", message: event.message, step: event.step } } });
    }
  }

  private async failCurrentStep(runId: string, message: string): Promise<void> {
    const run = await GenerationRun.findById(runId).select("steps").lean();
    const current = run?.steps.find((step) => step.status === "running") ?? run?.steps.find((step) => step.status === "pending");
    if (current) await this.recordStep(runId, { step: current.name as PipelineStep, status: "failed", message });
  }
}

function regenerationCapFilter(limit: number) {
  // Kits created before the fair-use counter existed have no regenerationCount yet.
  return { $or: [{ regenerationCount: { $lt: limit } }, { regenerationCount: { $exists: false } }] };
}

function regenerationLimitError(plan: string, limit: number): ApiError {
  return new ApiError(402, "QUOTA_EXCEEDED", plan === "free"
    ? `Free kits can be regenerated ${limit} times. Upgrade to Pro for more regenerations, or create a new kit.`
    : `This kit has reached its ${limit} regenerations. Create a new kit to start fresh.`, { feature: "regenerations", plan, limit, used: limit });
}

function initialSteps() {
  return stepNames.map((name) => ({ name, status: "pending" as const }));
}

function hashInput(input: GenerationInput): string {
  return createHash("sha256").update(JSON.stringify([input.jd, input.companyUrl, input.days])).digest("hex");
}

function stepStatus(status: "started" | "completed" | "warning" | "failed"): "running" | "complete" | "warning" | "failed" {
  return status === "started" ? "running" : status === "completed" ? "complete" : status;
}

type GenerationStage = "building" | "validating-persistence" | "preparing-save" | "saving-kit" | "marking-run-ready";
type ScopedRegeneration = NonNullable<GenerationRunRecord["regeneration"]>;

/**
 * Mongoose can hydrate an omitted nested object as `{}`. A regular first-time
 * run must not enter the regeneration merge path merely because that object is
 * truthy; only the discriminating `section` field makes it a real regeneration.
 */
export function scopedRegeneration(value: GenerationRunRecord["regeneration"] | Record<string, unknown> | undefined): ScopedRegeneration | undefined {
  if (value?.section === "questions" || value?.section === "flashcards" || value?.section === "company-brief" || value?.section === "schedule") {
    return value as ScopedRegeneration;
  }
  return undefined;
}

function toFailure(error: unknown, stage: GenerationStage): { code: string; message: string; retryable: boolean } {
  if (error instanceof PipelineError) return { code: error.code, message: error.message, retryable: retryableCodes.has(error.code) };
  if (stage !== "building") {
    return {
      code: persistenceFailureCode(stage),
      message: "Your kit was built but could not be saved. Please retry.",
      retryable: true
    };
  }
  return { code: "GENERATION_FAILED", message: "Generation stopped unexpectedly. Please retry.", retryable: true };
}

function persistenceFailureCode(stage: Exclude<GenerationStage, "building">): string {
  switch (stage) {
    case "validating-persistence": return "GENERATION_PERSISTENCE_VALIDATION_FAILED";
    case "preparing-save": return "GENERATION_PERSISTENCE_PREPARATION_FAILED";
    case "saving-kit": return "GENERATION_PERSISTENCE_SAVE_FAILED";
    case "marking-run-ready": return "GENERATION_PERSISTENCE_STATUS_FAILED";
  }
}

/**
 * Persisted run errors are intentionally concise for the client. The original
 * exception is logged only on the API host, together with a run id that lets us
 * correlate it with the safe status endpoint without leaking provider or DB data.
 */
function logGenerationFailure(runId: string, stage: GenerationStage, error: unknown): void {
  const cause = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { value: String(error) };
  console.error("Cruxer generation failed", { runId, stage, ...cause });
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11_000;
}
