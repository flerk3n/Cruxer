import { createHash } from "node:crypto";
import type { KitPipeline, PipelineStep } from "../../../../packages/pipeline/src/index.js";
import { PipelineError } from "../../../../packages/pipeline/src/index.js";
import { GenerationRun, type GenerationRunRecord } from "../db/models/generation-run.js";
import { Kit, type KitRecord } from "../db/models/kit.js";
import { ApiError } from "../lib/errors.js";
import { mergeRegeneratedSection, normalizeEditor } from "../lib/builder.js";
import { persistedKitSchema } from "../lib/kit-validation.js";

export type GenerationInput = { jd: string; companyUrl: string; days: number };

const stepNames = ["input", "research", "role", "questions", "flashcards", "coverage", "schedule", "validation"] as const satisfies readonly PipelineStep[];
const retryableCodes = new Set(["COMPANY_UNREACHABLE", "HTTP_ERROR", "GENERATION_FAILED", "GENERATION_INVALID", "GENERATION_UNAVAILABLE", "RESPONSE_TOO_LARGE"]);

/**
 * Persists a durable progress record around the shared pipeline. The pipeline is
 * injected so HTTP tests never invoke Gemini, crawling, or other external I/O.
 */
export class GenerationOrchestrator {
  constructor(private readonly pipeline: KitPipeline) {}

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
    request: { revision: number; section: "questions" | "flashcards"; category?: "technical" | "behavioural" | "system-design" | "company-fit" }
  ): Promise<{ kit: KitRecord & { _id: { toString(): string } }; generationRun: { id: string; kitId: string } }> {
    const kit = await Kit.findOne({ _id: kitId, ownerId }).select("generationInput status revision kit").lean();
    if (!kit) throw new ApiError(404, "KIT_NOT_FOUND", "The requested kit was not found.");
    if (!kit.kit || !kit.generationInput) throw new ApiError(409, "KIT_NOT_READY", "Generate this kit before regenerating a section.");
    if (kit.status === "generating") throw new ApiError(409, "GENERATION_IN_PROGRESS", "This kit is already being generated.");
    if (kit.revision !== request.revision) throw new ApiError(409, "REVISION_CONFLICT", "This kit has changed. Reload it before regenerating.");

    const inputHash = hashInput(kit.generationInput);
    const active = await GenerationRun.exists({ ownerId, inputHash, status: { $in: ["queued", "running"] } });
    if (active) throw new ApiError(409, "GENERATION_IN_PROGRESS", "An identical generation request is already in progress.");
    const run = await GenerationRun.create({
      ownerId, kitId, inputHash, input: kit.generationInput, status: "queued", steps: initialSteps(), warnings: [], retryCount: 0,
      regeneration: { section: request.section, ...(request.category ? { category: request.category } : {}) }
    });
    const reservedKit = await Kit.findOneAndUpdate(
      { _id: kitId, ownerId, revision: request.revision, status: { $ne: "generating" } },
      { $set: { status: "generating", generationRunId: run._id, inputHash }, $inc: { revision: 1 } },
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

    const queued = await GenerationRun.findOneAndUpdate(
      { _id: run._id, ownerId, status: { $in: ["failed", "retryable"] } },
      {
        $set: { status: "queued", steps: initialSteps(), warnings: [] },
        $unset: { terminalError: 1 },
        $inc: { retryCount: 1 }
      },
      { new: true, runValidators: true }
    );
    if (!queued) throw new ApiError(409, "GENERATION_NOT_RETRYABLE", "This generation run cannot be retried.");

    const reservedKit = await Kit.findOneAndUpdate(
      { _id: queued.kitId, ownerId, status: { $ne: "generating" } },
      { $set: { status: "generating", generationRunId: queued._id } },
      { new: true, runValidators: true }
    );
    if (!reservedKit) {
      await GenerationRun.updateOne({ _id: queued._id, status: "queued" }, { $set: { status: "failed", terminalError: { code: "KIT_UNAVAILABLE", message: "The kit could not be reserved for generation." } } });
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

    let run: GenerationRunRecord & { _id: { toString(): string } };
    try {
      run = await GenerationRun.create({ ownerId, kitId, inputHash, input, status: "queued", steps: initialSteps(), warnings: [], retryCount: 0 });
    } catch (error) {
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
      throw new ApiError(409, "GENERATION_IN_PROGRESS", "This kit is already being generated.");
    }

    void this.execute(run._id.toString());
    return { id: run._id.toString(), kitId };
  }

  private async execute(runId: string): Promise<void> {
    const run = await GenerationRun.findOneAndUpdate({ _id: runId, status: "queued" }, { $set: { status: "running" } }, { new: true });
    if (!run) return;

    try {
      const generated = await this.pipeline.run(
        { jd: run.input.jd, company_url: run.input.companyUrl, days: run.input.days },
        { onStep: async (event) => this.recordStep(runId, event) }
      );
      // The pipeline validates its output too; this second boundary protects the database
      // should a future pipeline implementation accidentally loosen that contract.
      const generatedKit = persistedKitSchema.parse(generated);
      const update = run.regeneration
        ? await this.mergeRegeneration(run, generatedKit)
        : { kit: generatedKit, editor: undefined };
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
      await GenerationRun.updateOne({ _id: run._id }, { $set: { status: "ready" }, $unset: { terminalError: 1 } });
    } catch (error) {
      const failure = toFailure(error);
      const status = failure.retryable ? "retryable" : "failed";
      await GenerationRun.updateOne(
        { _id: run._id },
        { $set: { status, terminalError: { code: failure.code, message: failure.message } } }
      );
      await Kit.updateOne(
        { _id: run.kitId, ownerId: run.ownerId, generationRunId: run._id },
        { $set: { status: "failed" } }
      );
      await this.failCurrentStep(runId, failure.message);
    }
  }

  private async mergeRegeneration(run: GenerationRunRecord & { _id: { toString(): string } }, generated: ReturnType<typeof persistedKitSchema.parse>): Promise<{ kit: ReturnType<typeof persistedKitSchema.parse>; editor: ReturnType<typeof normalizeEditor> }> {
    const current = await Kit.findOne({ _id: run.kitId, ownerId: run.ownerId, generationRunId: run._id }).select("kit editor").lean();
    if (!current?.kit || !run.regeneration) throw new Error("The kit regeneration lease is no longer valid.");
    const editor = normalizeEditor(current.editor);
    const kit = mergeRegeneratedSection(
      persistedKitSchema.parse(current.kit),
      generated,
      editor,
      run.regeneration.section,
      run.regeneration.category
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

function initialSteps() {
  return stepNames.map((name) => ({ name, status: "pending" as const }));
}

function hashInput(input: GenerationInput): string {
  return createHash("sha256").update(JSON.stringify([input.jd, input.companyUrl, input.days])).digest("hex");
}

function stepStatus(status: "started" | "completed" | "warning" | "failed"): "running" | "complete" | "warning" | "failed" {
  return status === "started" ? "running" : status === "completed" ? "complete" : status;
}

function toFailure(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof PipelineError) return { code: error.code, message: error.message, retryable: retryableCodes.has(error.code) };
  return { code: "GENERATION_FAILED", message: "Generation stopped unexpectedly. Please retry.", retryable: true };
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11_000;
}
