import type { AppConfig } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

type SignedUrlResponse = { signed_url?: unknown };

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
