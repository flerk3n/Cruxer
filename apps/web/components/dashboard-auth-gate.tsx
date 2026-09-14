"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, isUnauthenticated } from "@/lib/api";

/**
 * The API remains the security boundary, but this gate prevents any dashboard
 * route from briefly rendering private workspace UI for a signed-out visitor.
 * It is client-side because the session cookie is intentionally issued through
 * the API rewrite and is not available to static server rendering.
 */
export function DashboardAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "error">("checking");

  useEffect(() => {
    let active = true;
    void api.session().then(() => {
      if (active) setState("ready");
    }).catch((error) => {
      if (!active) return;
      if (isUnauthenticated(error)) {
        router.replace("/login");
        return;
      }
      setState("error");
    });
    return () => { active = false; };
  }, [router]);

  if (state === "ready") return <>{children}</>;
  if (state === "error") return <main className="grid min-h-dvh place-items-center px-6"><p className="text-sm text-muted-ink">Cruxer could not verify your session. Refresh to try again.</p></main>;
  return <main className="grid min-h-dvh place-items-center px-6" aria-busy="true" aria-label="Checking your session"><div className="h-10 w-10 animate-pulse rounded-2xl bg-signal/20" /></main>;
}
