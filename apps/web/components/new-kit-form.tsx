"use client";

import { Check, Circle, Globe2, Layers3, LoaderCircle, RefreshCw, ScanSearch, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldHint, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { api, apiErrorMessage, pollGenerationRun, type GenerationRun } from "@/lib/api";

type GenerationState = "idle" | "starting" | "polling" | "failed";
type Submission = { companyUrl: string; days: number; descriptionLength: number };
type StepStatus = "pending" | "running" | "complete" | "failed" | "warning";
type DisplayStep = { name: string; status: StepStatus; message?: string };

const plannedSteps = ["input", "research", "role", "questions", "flashcards", "coverage", "schedule", "validation"];
const stepCopy: Record<string, { title: string; detail: string }> = {
  input: { title: "Read source material", detail: "Securing the role context" },
  research: { title: "Research the company", detail: "Collecting public signals" },
  role: { title: "Map role signals", detail: "Extracting evidence-bound requirements" },
  questions: { title: "Build question bank", detail: "Writing targeted practice prompts" },
  flashcards: { title: "Create recall cards", detail: "Turning signals into study cues" },
  coverage: { title: "Check coverage", detail: "Verifying every requirement has a path" },
  schedule: { title: "Shape study plan", detail: "Distributing practice across your window" },
  validation: { title: "Final verification", detail: "Validating your preparation kit" }
};

function domain(url?: string) {
  try { return url ? new URL(url).hostname.replace(/^www\./, "") : "your company"; } catch { return "your company"; }
}

export function NewKitForm() {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<GenerationState>("idle");
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const watchRun = useCallback(async (runId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("polling");
    setError(null);
    try {
      const result = await pollGenerationRun(runId, { signal: controller.signal, onUpdate: setRun });
      if (result.status === "ready" && result.kitId) {
        router.replace(`/dashboard/kits/${result.kitId}`);
        router.refresh();
        return;
      }
      setState("failed");
      setError(result.terminalError?.message ?? (result.status === "retryable" ? "Generation needs another attempt." : "Cruxer could not complete this kit."));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setState("failed");
      setError(apiErrorMessage(cause));
    }
  }, [router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const jd = String(form.get("jobDescription") ?? "").trim();
    const companyUrl = String(form.get("companyUrl") ?? "").trim();
    const days = Number(form.get("days"));
    if (!jd || !companyUrl || !Number.isInteger(days) || days < 1 || days > 60) {
      setError("Add a job description, a valid company URL, and an interview window from 1 to 60 days.");
      return;
    }
    setSubmission({ companyUrl, days, descriptionLength: jd.length });
    setState("starting");
    setError(null);
    setRun(null);
    try {
      const { kit } = await api.createKit({ jd, companyUrl, days });
      const { generationRun } = await api.startGeneration(kit.id);
      await watchRun(generationRun.id);
    } catch (cause) {
      setState("failed");
      setError(apiErrorMessage(cause));
    }
  }

  async function retryRun() {
    if (!run || run.status !== "retryable") return;
    setState("starting");
    setError(null);
    try {
      const { generationRun } = await api.retryGenerationRun(run.id);
      await watchRun(generationRun.id);
    } catch (cause) {
      setState("failed");
      setError(apiErrorMessage(cause));
    }
  }

  const showProgress = state === "starting" || state === "polling" || (state === "failed" && Boolean(run));
  return <section><PageIntro /><AnimatePresence mode="wait">{showProgress ? <GenerationRoom key="generation" state={state} run={run} submission={submission} error={error} onRetry={() => void retryRun()} /> : <KitInput key="input" busy={false} error={error} onSubmit={onSubmit} />}</AnimatePresence></section>;
}

function PageIntro() {
  return <div className="relative overflow-hidden rounded-[2rem] border bg-surface/75 px-6 py-7 shadow-[0_14px_45px_hsl(var(--ink)/0.06)] sm:px-8"><div className="workspace-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" /><div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-signal/15 blur-3xl" aria-hidden="true" /><div className="relative"><p className="workspace-kicker text-xs">Your next role</p><h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.05em]">New preparation kit</h1><p className="mt-2 text-sm text-muted-ink">Paste the posting. Cruxer will do the reading around it.</p></div></div>;
}

function KitInput({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  function capInterviewWindow(event: React.FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (Number(input.value) > 60) input.value = "60";
  }

  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.24, ease: "easeOut" }}><Card className="workspace-panel mt-5 overflow-hidden rounded-[1.6rem]"><form className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]" onSubmit={onSubmit}><div className="p-5 sm:p-8"><div className="flex items-center justify-between gap-4"><FieldLabel htmlFor="job-description">Job description</FieldLabel><span className="rounded-full bg-violet/10 px-2.5 py-1 text-[11px] font-semibold text-violet">Source material</span></div><Textarea id="job-description" name="jobDescription" placeholder="Paste the full job description here…" className="min-h-80" required disabled={busy} /><FieldHint>The more complete the posting, the more precisely requirements can be mapped.</FieldHint><div className="mt-7"><FieldLabel htmlFor="company-url">Company website</FieldLabel><Input id="company-url" name="companyUrl" type="url" placeholder="https://company.com" required disabled={busy} /></div>{error && <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">{error}</p>}<Button type="submit" className="mt-7 shadow-[0_12px_28px_hsl(var(--signal)/0.25)]" disabled={busy}><Sparkles size={16} />Generate my kit</Button></div><aside className="relative overflow-hidden border-t bg-ink/[0.025] p-5 sm:p-8 lg:border-l lg:border-t-0"><div className="absolute -right-16 top-8 h-40 w-40 rounded-full bg-violet/10 blur-3xl" aria-hidden="true" /><div className="relative"><FieldLabel htmlFor="days">Interview window</FieldLabel><div className="flex items-center gap-3"><Input id="days" name="days" type="number" min="1" max="60" inputMode="numeric" aria-describedby="days-hint" defaultValue="5" onInput={capInterviewWindow} className="w-24 text-center text-lg font-semibold" disabled={busy} /><span className="text-sm text-muted-ink">days to prepare</span></div><FieldHint><span id="days-hint">Choose between 1 and 60 days.</span></FieldHint><div className="mt-12"><p className="text-sm font-semibold">What Cruxer will build</p><ul className="mt-5 space-y-4 text-sm text-muted-ink"><li className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-signal/10 text-signal"><ScanSearch size={15} /></span><span>Company and public-interview research</span></li><li className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet/10 text-violet"><Layers3 size={15} /></span><span>Requirements, questions, and recall cards</span></li><li className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-success/10 text-success"><Check size={15} /></span><span>A verified study plan for your window</span></li></ul></div></div></aside></form></Card></motion.div>;
}

function GenerationRoom({ state, run, submission, error, onRetry }: { state: GenerationState; run: GenerationRun | null; submission: Submission | null; error: string | null; onRetry: () => void }) {
  const reduceMotion = useReducedMotion();
  const actualSteps = new Map(run?.steps.map((step) => [step.name, step]) ?? []);
  const steps: DisplayStep[] = plannedSteps.map((name) => {
    const step = actualSteps.get(name);
    return { name, status: step?.status ?? (state === "starting" && name === "input" ? "running" : "pending"), message: step?.message };
  });
  const completed = steps.filter((step) => step.status === "complete").length;
  const running = steps.find((step) => step.status === "running");
  const failed = state === "failed";
  return <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -12 }} transition={{ duration: 0.28, ease: "easeOut" }} className="mt-5"><Card className="workspace-panel relative overflow-hidden rounded-[1.75rem] p-5 sm:p-8"><div className="generation-grid pointer-events-none absolute inset-0" aria-hidden="true" /><div className="generation-orbit pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full border border-violet/20" aria-hidden="true" /><div className="generation-orbit generation-orbit-delayed pointer-events-none absolute -right-3 -top-3 h-36 w-36 rounded-full border border-signal/25" aria-hidden="true" /><div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]"><div><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="workspace-kicker text-xs">Generation room</p><h2 className="mt-2 text-[clamp(1.8rem,3vw,2.6rem)] font-semibold tracking-[-0.045em]">{failed ? "Your kit needs attention." : state === "starting" ? "Setting up your research." : "Your kit is taking shape."}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-ink">{failed ? error : running ? `${stepCopy[running.name]?.title ?? "Working"}: ${running.message ?? stepCopy[running.name]?.detail ?? "Working carefully through the source material."}` : "Creating a secure generation run for your source material."}</p></div><div className="rounded-2xl border bg-surface/75 px-4 py-3 text-right shadow-sm"><p className="font-mono text-lg font-semibold text-violet">{completed}<span className="text-muted-ink">/{steps.length}</span></p><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-ink">steps complete</p></div></div><div className="mt-8 grid gap-2 sm:grid-cols-2">{steps.map((step, index) => <GenerationStep key={step.name} step={step} index={index} />)}</div>{failed && <div className="mt-7 flex flex-wrap items-center gap-3 rounded-2xl border border-danger/25 bg-danger/5 p-4"><p className="flex-1 text-sm text-danger">{error ?? "Generation could not continue."}</p>{run?.status === "retryable" && <Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw size={15} />Retry safely</Button>}</div>}</div><aside className="relative self-start rounded-[1.4rem] border bg-surface/70 p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-signal/10 text-signal"><Globe2 size={18} /></span><div><p className="text-sm font-semibold">{domain(submission?.companyUrl)}</p><p className="text-xs text-muted-ink">{submission?.days ?? "—"} day preparation window</p></div></div><div className="mt-6 border-t pt-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-ink">Generation status</p><div className="mt-4 flex items-center gap-3"><span className="relative grid h-10 w-10 place-items-center rounded-full bg-violet/10 text-violet">{failed ? <Circle size={16} className="text-danger" /> : <LoaderCircle size={18} className="animate-spin" />}<span className="absolute inset-0 rounded-full border border-violet/25" /></span><p className="text-sm font-medium">{failed ? "Waiting for your retry" : run ? "Progress is saved safely" : "Starting your secure run"}</p></div><p className="mt-4 text-xs leading-5 text-muted-ink">You can keep this tab open while each verified step is persisted. We will take you to the kit when it is ready.</p></div></aside></div></Card></motion.div>;
}

function GenerationStep({ step, index }: { step: DisplayStep; index: number }) {
  const detail = stepCopy[step.name] ?? { title: step.name, detail: "Working through your kit" };
  const complete = step.status === "complete";
  const running = step.status === "running";
  const failed = step.status === "failed";
  const warning = step.status === "warning";
  return <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: index * 0.025 }} className={`rounded-xl border p-3.5 transition-colors ${complete ? "border-success/25 bg-success/5" : running ? "border-violet/30 bg-violet/8 shadow-[0_8px_22px_hsl(var(--violet)/0.1)]" : failed ? "border-danger/30 bg-danger/5" : warning ? "border-warning/25 bg-warning/5" : "bg-surface/45"}`}><div className="flex items-start gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs ${complete ? "bg-success/15 text-success" : running ? "bg-violet/15 text-violet" : failed ? "bg-danger/15 text-danger" : warning ? "bg-warning/15 text-warning" : "bg-line/60 text-muted-ink"}`}>{complete ? <Check size={15} /> : running ? <LoaderCircle size={14} className="animate-spin" /> : failed ? "!" : warning ? "!" : String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block text-[13px] font-semibold text-ink">{detail.title}</span><span className="mt-0.5 block truncate text-xs text-muted-ink">{step.message ?? detail.detail}</span></span></div></motion.div>;
}
