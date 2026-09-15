import type { AppConfig } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

type SignedUrlResponse = { signed_url?: unknown };
type ConversationDetailsResponse = { status?: unknown; transcript?: unknown };

export type ElevenLabsTranscriptTurn = { speaker: "agent" | "user"; text: string };

export function assertElevenLabsConfigured(config: AppConfig): asserts config is AppConfig & { ELEVENLABS_API_KEY: string; ELEVENLABS_AGENT_ID: string } {
  if (!config.ELEVENLABS_API_KEY || !config.ELEVENLABS_AGENT_ID) {
    throw new ApiError(503, "MOCK_INTERVIEW_UNAVAILABLE", "Mock interviews are not configured yet. Add the ElevenLabs credentials to enable this feature.");
  }
}
/** Issues a short-lived, private conversation URL. The provider key never reaches the browser. */
export async function createElevenLabsSignedUrl(config: AppConfig): Promise<string> {
  assertElevenLabsConfigured(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(config.ELEVENLABS_AGENT_ID)}`, {
      headers: { "xi-api-key": config.ELEVENLABS_API_KEY },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new ApiError(502, "ELEVENLABS_SIGNING_FAILED", "Cruxer could not start a secure mock interview. Please try again shortly.");
    }
    const body = await response.json() as SignedUrlResponse;
    if (typeof body.signed_url !== "string" || !body.signed_url.startsWith("wss://")) {
      throw new ApiError(502, "ELEVENLABS_SIGNING_FAILED", "Cruxer received an invalid interview session from ElevenLabs.");
    }
    return body.signed_url;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "ELEVENLABS_SIGNING_FAILED", "Cruxer could not reach ElevenLabs. Please try again shortly.");
  } finally {
    clearTimeout(timeout);
  }
}

/** Retrieves the provider's durable transcript after a conversation has completed. */
export async function getElevenLabsConversation(config: AppConfig, conversationId: string): Promise<{ status: string; transcript: ElevenLabsTranscriptTurn[] }> {
  assertElevenLabsConfigured(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`, {
      headers: { "xi-api-key": config.ELEVENLABS_API_KEY },
      signal: controller.signal
    });
    if (!response.ok) throw new ApiError(502, "ELEVENLABS_CONVERSATION_FETCH_FAILED", "Cruxer could not retrieve the completed mock interview.");
    const body = await response.json() as ConversationDetailsResponse;
    const transcript = Array.isArray(body.transcript) ? body.transcript.flatMap((turn) => {
      if (!turn || typeof turn !== "object") return [];
      const record = turn as { role?: unknown; message?: unknown };
      if ((record.role !== "agent" && record.role !== "user") || typeof record.message !== "string" || !record.message.trim()) return [];
      const speaker: ElevenLabsTranscriptTurn["speaker"] = record.role;
      return [{ speaker, text: record.message.trim() }];
    }) : [];
    return { status: typeof body.status === "string" ? body.status : "unknown", transcript };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "ELEVENLABS_CONVERSATION_FETCH_FAILED", "Cruxer could not reach ElevenLabs to retrieve this interview.");
  } finally {
    clearTimeout(timeout);
  }
}
