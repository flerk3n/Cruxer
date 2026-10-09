"use client";

import Link from "next/link";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { track } from "@/lib/analytics";

export function VerifyEmailPanel() {
  const token = useSearchParams().get("token");
  const started = useRef(false);
  const [state, setState] = useState<"verifying" | "verified" | "error">(token ? "verifying" : "error");
  const [message, setMessage] = useState<string | null>(token ? null : "This verification link is incomplete. Request a new one from your dashboard.");

  useEffect(() => {
    // Tokens are single use; never submit twice (React strict mode runs effects twice in development).
    if (!token || started.current) return;
    started.current = true;
    void api.verifyEmail(token).then(() => {
      track("email_verified");
      setState("verified");
    }).catch((cause) => {
      setState("error");
      setMessage(apiErrorMessage(cause));
    });
  }, [token]);

  return <main className="landing-shell marketing-shell grid min-h-screen place-items-center px-5 py-24">
    <section className="w-full max-w-md rounded-[1.75rem] border border-white/15 bg-[#10142b]/85 p-8 text-center shadow-[0_32px_90px_rgba(0,0,0,.42)] backdrop-blur-xl">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-indigo-200">{state === "verifying" ? <LoaderCircle className="animate-spin" /> : state === "verified" ? <CircleCheck /> : <CircleAlert />}</span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">{state === "verifying" ? "Verifying your email…" : state === "verified" ? "Email verified" : "We couldn't verify that link"}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">{state === "verified" ? "You're all set. You can now generate interview kits." : message ?? "This only takes a moment."}</p>
      {state !== "verifying" && <Link href="/dashboard" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-indigo-200">Go to my dashboard</Link>}
    </section>
  </main>;
}
