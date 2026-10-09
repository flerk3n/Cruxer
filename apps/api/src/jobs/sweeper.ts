import type { AppConfig } from "../config/env.js";
import { settleMockSession } from "../billing/entitlements.js";
import { GenerationRun } from "../db/models/generation-run.js";
import { Kit } from "../db/models/kit.js";
import { MockInterviewSession } from "../db/models/mock-interview-session.js";
import type { GenerationOrchestrator } from "../services/generation-orchestrator.js";
import { collectMockInterviewTranscript, settleMockUsageFromProvider } from "../services/mock-interview-transcript.js";

const STALE_RUN_MS = 15 * 60 * 1000;
/** Comfortably longer than the 10-minute maximum voice session. */
const STALE_MOCK_MS = 20 * 60 * 1000;
const BATCH = 50;

/**
 * Recovers work that a process restart or a closed browser tab left behind:
 * generation runs that will never finish are made retryable and refunded, and
 * voice reservations are settled against the provider's real call length.
 * Every transition is an atomic claim, so overlapping sweeps are harmless.
 */
export async function sweepOnce(config: AppConfig, generation: Pick<GenerationOrchestrator, "refundCharge">, now = new Date()): Promise<{ runs: number; mocks: number }> {
  let runs = 0;
  let mocks = 0;

  const runCutoff = new Date(now.getTime() - STALE_RUN_MS);
  const staleRuns = await GenerationRun.find({ status: { $in: ["queued", "running"] }, updatedAt: { $lt: runCutoff } }).select("_id").limit(BATCH).lean();
  for (const stale of staleRuns) {
    const claimed = await GenerationRun.findOneAndUpdate(
      { _id: stale._id, status: { $in: ["queued", "running"] }, updatedAt: { $lt: runCutoff } },
      { $set: { status: "retryable", terminalError: { code: "GENERATION_INTERRUPTED", message: "Generation was interrupted. Retry to continue; this attempt was not counted." } } },
      { new: true }
    ).select("_id kitId ownerId").lean();
    if (!claimed) continue;
    if (claimed.kitId) await Kit.updateOne({ _id: claimed.kitId, generationRunId: claimed._id, status: "generating" }, { $set: { status: "failed" } });
    await generation.refundCharge(claimed._id.toString());
    runs += 1;
  }

  const mockCutoff = new Date(now.getTime() - STALE_MOCK_MS);
  const elevenLabsConfigured = Boolean(config.ELEVENLABS_API_KEY && config.ELEVENLABS_AGENT_ID);

  // Sessions whose browser never called /end.
  const abandoned = await MockInterviewSession.find({ status: { $in: ["created", "active", "ending"] }, updatedAt: { $lt: mockCutoff } }).select("_id").limit(BATCH).lean();
  for (const candidate of abandoned) {
    const claimed = await MockInterviewSession.findOneAndUpdate(
      { _id: candidate._id, status: { $in: ["created", "active", "ending"] }, updatedAt: { $lt: mockCutoff } },
      { $set: { status: "completed", endedAt: now } },
      { new: true }
    ).select("_id").lean();
    if (!claimed) continue;
    try {
      if (elevenLabsConfigured) await collectMockInterviewTranscript(claimed._id.toString(), config, { retryDelayMs: 0 });
      else await settleMockSession(claimed._id.toString(), null);
      mocks += 1;
    } catch (error) {
      logSweepError("mock_collect", claimed._id.toString(), error);
    }
  }

  // Finished sessions whose voice usage is still reserved.
  const unsettled = await MockInterviewSession.find({
    status: { $in: ["completed", "evaluating", "ready", "failed"] },
    reservedSeconds: { $exists: true },
    billedSeconds: { $exists: false },
    updatedAt: { $lt: mockCutoff }
  }).select("_id providerConversationId reservedSeconds createdAt").limit(BATCH).lean();
  for (const session of unsettled) {
    try {
      if (!elevenLabsConfigured) await settleMockSession(session._id.toString(), null);
      else if (await settleMockUsageFromProvider(session, config, now) === "pending") continue;
      mocks += 1;
    } catch (error) {
      logSweepError("mock_settle", session._id.toString(), error);
    }
  }

  if (runs > 0 || mocks > 0) console.info(JSON.stringify({ event: "sweeper_recovered", runs, mocks }));
  return { runs, mocks };
}

export function startSweeper(config: AppConfig, generation: Pick<GenerationOrchestrator, "refundCharge">, intervalMs = 5 * 60 * 1000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweepOnce(config, generation);
    } catch (error) {
      logSweepError("sweep", "all", error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

function logSweepError(stage: string, id: string, error: unknown): void {
  console.error(JSON.stringify({ event: "sweeper_error", stage, id, reason: error instanceof Error ? error.message : "unknown" }));
}
