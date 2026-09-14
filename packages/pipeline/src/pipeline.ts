import type { Kit } from "@cruxer/domain";
import { PipelineError } from "./errors";
import { pipelineInputSchema, type PipelineInput } from "./input-schema";

export type PipelineStep = "input" | "research" | "role" | "questions" | "flashcards" | "coverage" | "schedule" | "validation";

export interface PipelineObserver {
  onStep?(event: { step: PipelineStep; status: "started" | "completed" | "warning" | "failed"; message?: string }): void | Promise<void>;
}

/** Contract used by both Express generation and the required batch evaluator. */
export interface KitPipeline {
  run(input: PipelineInput, observer?: PipelineObserver): Promise<Kit>;
}

/**
 * An intentional temporary boundary: it validates the shared input contract
 * and reports progress, but cannot manufacture a kit until the LLM adapters
 * and orchestration phase are connected.
 */
export class UnconfiguredKitPipeline implements KitPipeline {
  async run(input: PipelineInput, observer?: PipelineObserver): Promise<Kit> {
    pipelineInputSchema.parse(input);
    await observer?.onStep?.({ step: "input", status: "completed" });
    await observer?.onStep?.({ step: "research", status: "failed", message: "Generation adapters have not been configured." });
    throw new PipelineError("PIPELINE_NOT_CONFIGURED", "Generation adapters have not been configured.");
  }
}
