import type { AppConfig } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

type SignedUrlResponse = { signed_url?: unknown };
type ConversationDetailsResponse = { status?: unknown; transcript?: unknown; agent_id?: unknown; user_id?: unknown; metadata?: { call_duration_secs?: unknown } | null };
type ConversationListResponse = { conversations?: unknown };

export type ElevenLabsTranscriptTurn = { speaker: "agent" | "user"; text: string };
export type ElevenLabsConversation = {
  status: string;
  transcript: ElevenLabsTranscriptTurn[];
  /** Billable connection time reported by the provider. */
  durationSeconds?: number;
  agentId?: string;
  /** The `userId` Cruxer passed at session start: the mock interview session id. */
  userId?: string;
};

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
export async function getElevenLabsConversation(config: AppConfig, conversationId: string): Promise<ElevenLabsConversation> {
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
    const duration = body.metadata?.call_duration_secs;
    return {
      status: typeof body.status === "string" ? body.status : "unknown",
      transcript,
      ...(typeof duration === "number" && Number.isFinite(duration) && duration >= 0 ? { durationSeconds: duration } : {}),
      ...(typeof body.agent_id === "string" ? { agentId: body.agent_id } : {}),
      ...(typeof body.user_id === "string" ? { userId: body.user_id } : {})
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "ELEVENLABS_CONVERSATION_FETCH_FAILED", "Cruxer could not reach ElevenLabs to retrieve this interview.");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Finds the provider conversation for a Cruxer session when the browser never
 * reported its conversation id (closed tab, lost network). Sessions are started
 * with `userId` set to the Cruxer session id, which the provider records.
 */
export async function findElevenLabsConversationForSession(config: AppConfig, sessionId: string): Promise<string | undefined> {
  assertElevenLabsConfigured(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const query = new URLSearchParams({ agent_id: config.ELEVENLABS_AGENT_ID, user_id: sessionId, page_size: "5" });
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?${query.toString()}`, {
      headers: { "xi-api-key": config.ELEVENLABS_API_KEY },
      signal: controller.signal
    });
    if (!response.ok) throw new ApiError(502, "ELEVENLABS_CONVERSATION_FETCH_FAILED", "Cruxer could not look up the mock interview.");
    const body = await response.json() as ConversationListResponse;
    const conversations = Array.isArray(body.conversations) ? body.conversations : [];
    for (const item of conversations) {
      const record = item as { conversation_id?: unknown; user_id?: unknown };
      // Only trust a match the provider attributes to this exact session.
      if (typeof record.conversation_id === "string" && (record.user_id === undefined || record.user_id === sessionId)) return record.conversation_id;
    }
    return undefined;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "ELEVENLABS_CONVERSATION_FETCH_FAILED", "Cruxer could not reach ElevenLabs to look up this interview.");
  } finally {
    clearTimeout(timeout);
  }
}

/** A conversation belongs to a session only if it ran on Cruxer's agent for that session id. */
export function conversationBelongsToSession(conversation: Pick<ElevenLabsConversation, "agentId" | "userId">, config: AppConfig, sessionId: string): boolean {
  if (conversation.agentId !== undefined && conversation.agentId !== config.ELEVENLABS_AGENT_ID) return false;
  if (conversation.userId !== undefined && conversation.userId !== sessionId) return false;
  return true;
}
