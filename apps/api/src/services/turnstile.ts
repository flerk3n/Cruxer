import type { AppConfig } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

type TurnstileConfig = Pick<AppConfig, "TURNSTILE_SECRET_KEY" | "NODE_ENV">;

/**
 * Verifies a Cloudflare Turnstile token server-side. Local development without a
 * secret skips the check; production configuration requires the secret at boot.
 */
export async function verifyTurnstile(config: TurnstileConfig, token: string | undefined, remoteIp?: string): Promise<void> {
  if (!config.TURNSTILE_SECRET_KEY) {
    if (config.NODE_ENV === "production") throw new ApiError(503, "BOT_CHECK_UNAVAILABLE", "Sign-in protection is not configured.");
    return;
  }
  if (!token) throw new ApiError(403, "BOT_CHECK_FAILED", "Please complete the security check and try again.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const body = new URLSearchParams({ secret: config.TURNSTILE_SECRET_KEY, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: controller.signal });
    const result = await response.json() as { success?: unknown };
    if (result.success !== true) throw new ApiError(403, "BOT_CHECK_FAILED", "The security check failed. Please refresh and try again.");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "BOT_CHECK_UNAVAILABLE", "The security check could not be completed. Please try again shortly.");
  } finally {
    clearTimeout(timeout);
  }
}
