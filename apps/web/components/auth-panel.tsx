import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CruxerLogo } from "@/components/cruxer-logo";
import { Button } from "@/components/ui/button";
import { FieldHint, FieldLabel, Input } from "@/components/ui/field";

export function AuthPanel({ mode }: { mode: "login" | "register" }) {
  const creating = mode === "register";
  return <main className="page-frame grid min-h-screen items-center gap-12 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
    <section className="hidden lg:block"><CruxerLogo /><p className="editorial-title mt-16 max-w-md text-5xl leading-[0.98]">A little more certainty before a big conversation.</p><p className="mt-6 max-w-sm text-muted-ink">Build a research-grounded interview plan that you can reshape until it sounds like you.</p></section>
    <section className="mx-auto w-full max-w-md"><div className="mb-10 lg:hidden"><CruxerLogo /></div><div className="rounded-card border bg-surface p-6 sm:p-8"><p className="eyebrow">{creating ? "Start your workspace" : "Welcome back"}</p><h1 className="mt-2 text-[clamp(1.75rem,4vw,2rem)] font-semibold tracking-tight">{creating ? "Prepare with clarity." : "Pick up where you left off."}</h1><p className="mt-3 text-sm text-muted-ink">{creating ? "Create an account to make your first preparation kit." : "Sign in to continue working through your interview kit."}</p>
      <form className="mt-8 space-y-5" aria-label={creating ? "Create account" : "Sign in"}>
        {creating && <div><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name="name" autoComplete="name" placeholder="Your name" required /></div>}
        <div><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
        <div><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" name="password" type="password" autoComplete={creating ? "new-password" : "current-password"} minLength={8} placeholder="At least 8 characters" required />{creating && <FieldHint>Use at least 8 characters. You can change this later.</FieldHint>}</div>
        <Button type="submit" className="mt-2 w-full">{creating ? "Create account" : "Sign in"}<ArrowRight size={16} /></Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-ink">{creating ? "Already have an account?" : "New to Cruxer?"} <Link href={creating ? "/login" : "/register"} className="font-medium text-ink underline decoration-line underline-offset-4">{creating ? "Sign in" : "Create an account"}</Link></p>
    </div></section>
  </main>;
}
