"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowRight, Check, FileText, Search, Sparkles } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { StatusPill } from "@/components/ui/status-pill";

gsap.registerPlugin(useGSAP);

export function LandingHero() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = gsap.utils.toArray<HTMLElement>("[data-hero-reveal]");
      gsap.set(targets, { autoAlpha: 0, y: 14 });
      gsap.timeline({ defaults: { ease: "power2.out" } }).to(targets, { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.07 });
    });
    return () => media.revert();
  }, { scope: root });

  return <section ref={root} className="page-frame relative grid min-h-[calc(100vh-80px)] items-center gap-12 overflow-hidden py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
    <div className="pointer-events-none absolute -top-32 left-1/4 -z-10 h-[32rem] w-[32rem] rounded-full bg-signal/10 blur-3xl" />
    <div className="max-w-2xl">
      <p data-hero-reveal className="mb-5 inline-flex items-center gap-2 rounded-full border bg-surface/75 px-3 py-1.5 text-xs font-medium text-muted-ink"><Sparkles size={14} className="text-signal" /> Research-grounded interview prep</p>
      <h1 data-hero-reveal className="editorial-title text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.96] text-ink">Turn a role into a plan you can <i className="text-signal">defend.</i></h1>
      <p data-hero-reveal className="mt-6 max-w-xl text-base leading-7 text-muted-ink">Cruxer researches the company, draws out the role signals, and builds an adjustable practice kit around what matters.</p>
      <div data-hero-reveal className="mt-8 flex flex-wrap items-center gap-3"><Link href="/register" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-signal px-5 text-[13px] font-medium text-white transition-colors hover:bg-signal-strong dark:text-ink">Create a preparation kit <ArrowRight size={16} /></Link><span className="text-xs text-muted-ink">Built for the interview in front of you.</span></div>
    </div>
    <div data-hero-reveal className="relative mx-auto w-full max-w-xl rounded-[1.5rem] border bg-surface p-3 shadow-ambient sm:p-5">
      <div className="flex items-center justify-between border-b pb-4"><div><p className="font-medium">Senior Frontend Engineer</p><p className="mt-0.5 text-xs text-muted-ink">Atlas · 5 days to interview</p></div><StatusPill status="ready" /></div>
      <div className="grid gap-3 py-4 sm:grid-cols-2"><PreviewCard icon={Search} title="Company brief" text="Product intelligence, hiring signals, and sources." /><PreviewCard icon={FileText} title="Question bank" text="18 questions mapped to 7 role requirements." /></div>
      <div className="rounded-xl border bg-canvas p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium">Coverage check</span><span className="text-xs font-medium text-success">7 of 7 covered</span></div><div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full w-full rounded-full bg-success" /></div><div className="mt-3 flex items-center gap-2 text-xs text-muted-ink"><Check size={14} className="text-success" /> Every must-have requirement has a practice path.</div></div>
    </div>
  </section>;
}

function PreviewCard({ icon: Icon, title, text }: { icon: typeof Search; title: string; text: string }) {
  return <article className="rounded-xl border p-4"><Icon size={17} className="mb-6 text-violet" /><h2 className="text-[13px] font-medium">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-ink">{text}</p></article>;
}
