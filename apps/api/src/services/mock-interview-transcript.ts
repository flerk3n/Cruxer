import type { AppConfig } from "../config/env.js";
import { MockInterviewSession } from "../db/models/mock-interview-session.js";
import { getElevenLabsConversation } from "./elevenlabs.js";
import { evaluateMockInterview } from "./mock-interview-evaluator.js";

const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 2_500;

/** Fetches the provider transcript server-to-server after a voice session ends. */
export async function collectMockInterviewTranscript(sessionId: string, config: AppConfig): Promise<void> {
  const session = await MockInterviewSession.findById(sessionId).lean();
  if (!session || session.status !== "completed" || !session.providerConversationId) {
    if (session && !session.providerConversationId) await markFailed(sessionId, "CONVERSATION_ID_MISSING", "The mock interview did not provide a conversation ID for scoring.");
    return;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const details = await getElevenLabsConversation(config, session.providerConversationId);
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
        await markFailed(sessionId, "ELEVENLABS_CONVERSATION_FAILED", "ElevenLabs could not complete this mock interview.");
        return;
      }
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        await markFailed(sessionId, "TRANSCRIPT_FETCH_FAILED", error instanceof Error ? "Cruxer could not retrieve the interview transcript. Please try another mock interview." : "Cruxer could not retrieve the interview transcript.");
        return;
      }
    }
    await wait(RETRY_DELAY_MS);
  }
  await markFailed(sessionId, "TRANSCRIPT_TIMEOUT", "ElevenLabs did not finish preparing the transcript in time. Please try another mock interview.");
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
