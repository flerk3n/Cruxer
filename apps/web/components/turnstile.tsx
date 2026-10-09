"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = null; reject(new Error("Turnstile failed to load.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type TurnstileHandle = { reset: () => void };

/**
 * Cloudflare Turnstile bot check. Renders nothing when no site key is configured
 * (local development), matching the API, which skips verification without a secret.
 */
export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void }>(function Turnstile({ onToken }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({ reset: () => { onTokenRef.current(null); if (widgetId.current) window.turnstile?.reset(widgetId.current); } }), []);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    let cancelled = false;
    void loadScript().then(() => {
      if (cancelled || !container.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: turnstileSiteKey,
        theme: "dark",
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null)
      });
    }).catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, []);

  if (!turnstileSiteKey) return null;
  return <div ref={container} className="min-h-[65px]" />;
});
