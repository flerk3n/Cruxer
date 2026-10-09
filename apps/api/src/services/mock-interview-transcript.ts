import { settleMockSession } from "../billing/entitlements.js";
import type { AppConfig } from "../config/env.js";
import { MockInterviewSession } from "../db/models/mock-interview-session.js";
import { conversationBelongsToSession, findElevenLabsConversationForSession, getElevenLabsConversation } from "./elevenlabs.js";
import { evaluateMockInterview } from "./mock-interview-evaluator.js";

const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 2_500;

/**
 * Fetches the provider transcript server-to-server after a voice session ends,
 * bills the actual call duration against the reserved minutes, then scores it.
 */
export async function collectMockInterviewTranscript(sessionId: string, config: AppConfig, options: { retryDelayMs?: number } = {}): Promise<void> {
  const session = await MockInterviewSession.findById(sessionId).lean();
  if (!session || session.status !== "completed") return;

  const conversationId = session.providerConversationId ?? await findElevenLabsConversationForSession(config, sessionId).catch(() => undefined);
  if (!conversationId) {
    await markFailed(sessionId, "CONVERSATION_ID_MISSING", "The mock interview did not provide a conversation ID for scoring.");
    // No provider conversation exists for this session, so nothing was consumed.
    await settleMockSession(sessionId, null);
    return;
  }
  if (!session.providerConversationId) {
    await MockInterviewSession.updateOne({ _id: sessionId, providerConversationId: { $exists: false } }, { $set: { providerConversationId: conversationId } }).catch(() => undefined);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const details = await getElevenLabsConversation(config, conversationId);
      if (!conversationBelongsToSession(details, config, sessionId)) {
        await markFailed(sessionId, "CONVERSATION_MISMATCH", "This mock interview could not be verified.");
        // The real call length cannot be verified, so the full reservation is billed.
        await settleMockSession(sessionId, session.reservedSeconds ?? 0);
        return;
      }
      if (details.status === "done") await settleMockSession(sessionId, details.durationSeconds ?? session.reservedSeconds ?? 0);
      if (details.status === "done" && details.transcript.length > 0) {
        const claimed = await MockInterviewSession.findOneAndUpdate(
          { _id: sessionId, status: "completed" },
          { $set: { status: "evaluating", transcript: details.transcript.map((turn) => ({ speaker: turn.speaker, text: turn.text })), failure: undefined } },
          { new: true, runValidators: true }
        );
        if (claimed) {
          console.info(JSON.stringify({ event: "mock_interview_transcript_collected", sessionId }));
          await evaluateMockInterview(sessionId);
        }
        return;
      }
      if (details.status === "failed") {
        await settleMockSession(sessionId, details.durationSeconds ?? null);
        await markFailed(sessionId, "ELEVENLABS_CONVERSATION_FAILED", "ElevenLabs could not complete this mock interview.");
        return;
      }
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        // Usage stays reserved; the background sweeper settles it once the provider responds.
        await markFailed(sessionId, "TRANSCRIPT_FETCH_FAILED", error instanceof Error ? "Cruxer could not retrieve the interview transcript. Please try another mock interview." : "Cruxer could not retrieve the interview transcript.");
        return;
      }
    }
    await wait(options.retryDelayMs ?? RETRY_DELAY_MS);
  }
  await markFailed(sessionId, "TRANSCRIPT_TIMEOUT", "ElevenLabs did not finish preparing the transcript in time. Please try another mock interview.");
}

/**
 * Settles voice usage for a session whose reservation is still open, without
 * re-running scoring. Used by the background sweeper.
 */
export async function settleMockUsageFromProvider(
  session: { _id: { toString(): string }; providerConversationId?: string; reservedSeconds?: number; createdAt: Date },
  config: AppConfig,
  now = new Date()
): Promise<"settled" | "pending"> {
  const sessionId = session._id.toString();
  const conversationId = session.providerConversationId ?? await findElevenLabsConversationForSession(config, sessionId);
  if (!conversationId) {
    await settleMockSession(sessionId, null);
    return "settled";
  }
  const details = await getElevenLabsConversation(config, conversationId);
  if (!conversationBelongsToSession(details, config, sessionId)) {
    await settleMockSession(sessionId, session.reservedSeconds ?? 0);
    return "settled";
  }
  if (details.status === "done" || details.status === "failed") {
    await settleMockSession(sessionId, details.durationSeconds ?? (details.status === "done" ? session.reservedSeconds ?? 0 : null));
    return "settled";
  }
  // Still processing upstream. After two hours, bill the reservation rather than hold it forever.
  if (now.getTime() - session.createdAt.getTime() > 2 * 60 * 60 * 1000) {
    await settleMockSession(sessionId, session.reservedSeconds ?? 0);
    return "settled";
  }
  return "pending";
}

async function markFailed(sessionId: string, code: string, message: string): Promise<void> {
  console.warn(JSON.stringify({ event: "mock_interview_transcript_failed", sessionId, code }));
  await MockInterviewSession.findOneAndUpdate(
    { _id: sessionId, status: { $in: ["completed", "evaluating"] } },
    { $set: { status: "failed", failure: { code, message } } },
    { runValidators: true }
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
