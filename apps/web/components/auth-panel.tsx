"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import logoMark from "../../../logo.svg";
import { Button } from "@/components/ui/button";
import { FieldHint, FieldLabel, Input } from "@/components/ui/field";
import { GlyphMatrix } from "@/components/ui/glyph-matrix";
import { api, apiErrorMessage } from "@/lib/api";

export function AuthPanel({ mode }: { mode: "login" | "register" }) {
  const creating = mode === "register";
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setError(null);
    setSubmitting(true);
    try {
      if (creating) await api.register({ name, email, password });
      else await api.login({ email, password });
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="landing-shell marketing-shell relative grid min-h-screen place-items-center overflow-hidden px-5 py-24 sm:px-8">
    <GlyphMatrix className="absolute inset-0 h-full w-full opacity-[.5] [mask-image:radial-gradient(ellipse_at_center,black_0%,transparent_82%)]" cellSize={34} mutationRate={0.025} color="#c7d2fe" />
    <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 py-6 sm:px-9 sm:py-8"><Link href="/" className="group flex items-center gap-3 rounded-xl" aria-label="Cruxer home"><Image src={logoMark} alt="" className="h-[5.5rem] w-[5.5rem] brightness-0 invert" priority /><span className="marketing-wordmark text-[clamp(2.3rem,5vw,4.3rem)] leading-none text-white">Cruxer</span></Link><Link href="/" className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-100/75 transition hover:text-white"><ArrowLeft size={14} /> Back to home</Link></header>
    <section className="relative z-10 w-full max-w-[29rem]"><div className="rounded-[1.75rem] border border-white/15 bg-[#10142b]/85 p-6 shadow-[0_32px_90px_rgba(0,0,0,.42)] backdrop-blur-xl sm:p-9"><p className="landing-kicker">{creating ? "Start your workspace" : "Welcome back"}</p><h1 className="mt-4 text-[clamp(2rem,4vw,2.6rem)] font-semibold tracking-[-.05em] text-white">{creating ? "Prepare with clarity." : "Pick up where you left off."}</h1><p className="mt-3 text-sm leading-6 text-slate-400">{creating ? "Create an account to make your first preparation kit." : "Sign in to continue working through your interview kit."}</p>
      <form className="mt-8 space-y-5" aria-label={creating ? "Create account" : "Sign in"} onSubmit={onSubmit}>
        {creating && <div><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name="name" autoComplete="name" placeholder="Your name" required /></div>}
        <div><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
        <div><FieldLabel htmlFor="password">Password</FieldLabel><div className="relative"><Input id="password" name="password" type={passwordVisible ? "text" : "password"} autoComplete={creating ? "new-password" : "current-password"} minLength={12} placeholder="At least 12 characters" className="pr-12" required /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300" aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible}>{passwordVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>{creating && <FieldHint>Use at least 12 characters.</FieldHint>}</div>
        {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        <Button type="submit" className="mt-2 w-full !bg-indigo-300 !text-slate-950 hover:!bg-indigo-200" disabled={submitting}>{submitting ? "Please wait…" : creating ? "Create account" : "Sign in"}<ArrowRight size={16} /></Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">{creating ? "Already have an account?" : "New to Cruxer?"} <Link href={creating ? "/login" : "/register"} className="font-medium text-indigo-200 underline decoration-indigo-300/40 underline-offset-4 hover:text-white">{creating ? "Sign in" : "Create an account"}</Link></p>
    </div></section>
  </main>;
}
