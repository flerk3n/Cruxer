"use client";

import { FileUp, Info, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldHint, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { api, apiErrorMessage, isTerminalRun, pollGenerationRun, type GenerationRun } from "@/lib/api";

type GenerationState = "idle" | "starting" | "polling" | "failed";

export function NewKitForm() {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<GenerationState>("idle");
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const watchRun = useCallback(async (runId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("polling");
    setError(null);
    try {
      const result = await pollGenerationRun(runId, {
        signal: controller.signal,
        onUpdate: setRun
      });
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

  const busy = state === "starting" || state === "polling";
  return <><div><p className="eyebrow">Your next role</p><h1 className="mt-2 text-[clamp(1.75rem,4vw,2rem)] font-semibold tracking-tight">New preparation kit</h1><p className="mt-2 text-sm text-muted-ink">Paste the posting. Cruxer will do the reading around it.</p></div>
    <Card className="mt-8 overflow-hidden"><form className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]" onSubmit={onSubmit}><div className="p-5 sm:p-7"><FieldLabel htmlFor="job-description">Job description</FieldLabel><Textarea id="job-description" name="jobDescription" placeholder="Paste the full job description here…" className="min-h-80" required disabled={busy} /><FieldHint>The more complete the posting, the more precisely requirements can be mapped.</FieldHint><div className="mt-6"><FieldLabel htmlFor="company-url">Company website</FieldLabel><Input id="company-url" name="companyUrl" type="url" placeholder="https://company.com" required disabled={busy} /></div>
      {error && <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">{error}</p>}
      <Button type="submit" className="mt-6" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}{state === "starting" ? "Starting generation…" : state === "polling" ? "Building your kit…" : "Generate my kit"}</Button>
    </div><aside className="border-t bg-canvas p-5 sm:p-7 lg:border-l lg:border-t-0"><FieldLabel htmlFor="days">Interview window</FieldLabel><div className="flex items-center gap-3"><Input id="days" name="days" type="number" min="1" max="60" defaultValue="5" className="w-24" disabled={busy} /><span className="text-sm text-muted-ink">days</span></div><GenerationStatus run={run} loading={state === "starting" || state === "polling"} onRetry={state === "failed" && run?.status === "retryable" ? () => void retryRun() : undefined} />
      <div className="mt-10 border-t pt-5"><button type="button" className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-ink hover:text-signal"><FileUp size={16} />Upload multiple roles</button><p className="mt-2 text-xs leading-5 text-muted-ink"><Info size={13} className="mr-1 inline" />Batch upload is coming with row-level validation.</p></div></aside></form></Card>
  </>;
}

function GenerationStatus({ run, loading, onRetry }: { run: GenerationRun | null; loading: boolean; onRetry?: () => void }) {
  const steps = run?.steps ?? [];
  return <div className="mt-10"><p className="text-[13px] font-medium">{loading ? "Generation progress" : "What happens next"}</p>{steps.length > 0 ? <ol className="mt-4 space-y-3" aria-live="polite">{steps.map((step, index) => <li key={`${step.name}-${index}`} className="flex gap-3 text-sm text-muted-ink"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${step.status === "complete" ? "bg-success/15 text-success" : step.status === "failed" ? "bg-danger/15 text-danger" : step.status === "running" ? "bg-violet/15 text-violet" : "bg-surface text-muted-ink"}`}>{step.status === "complete" ? "✓" : index + 1}</span><span><span className="capitalize">{step.name.replace(/-/g, " ")}</span>{step.message && <span className="mt-0.5 block text-xs">{step.message}</span>}</span></li>)}</ol> : <ol className="mt-4 space-y-4 text-sm text-muted-ink"><li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface text-xs text-ink">1</span>Research company site</li><li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface text-xs text-ink">2</span>Find interview discussion</li><li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface text-xs text-ink">3</span>Build and check your plan</li></ol>}{onRetry && <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}><RefreshCw size={15} />Resume progress</Button>}</div>;
}
