import { track as vercelTrack } from "@vercel/analytics";

/**
 * Product funnel events (Vercel Web Analytics custom events). Properties must never
 * carry personal data: no emails, names, job descriptions, or tokens.
 */
type EventMap = {
  sign_up: Record<string, never>;
  login: Record<string, never>;
  email_verified: Record<string, never>;
  verification_resent: Record<string, never>;
  kit_generation_started: { plan: string };
  kit_ready: Record<string, never>;
  quota_exceeded: { feature: string; plan: string };
  upgrade_clicked: { source: string };
  checkout_started: { source: string };
  checkout_completed: Record<string, never>;
  billing_portal_opened: Record<string, never>;
  mock_started: { minutes: number };
  mock_completed: Record<string, never>;
};

export function track<Name extends keyof EventMap>(name: Name, properties?: EventMap[Name]): void {
  try {
    vercelTrack(name, properties as Record<string, string | number> | undefined);
  } catch {
    // Analytics must never break the product flow.
  }
}

/** Drops query strings and fragments so tokens or checkout ids are never reported. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}
