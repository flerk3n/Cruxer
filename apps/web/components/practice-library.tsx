"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { api, apiErrorMessage, type KitSummary, type WorkspaceKitProgress } from "@/lib/api";

export function PracticeLibrary() {
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [progress, setProgress] = useState<Map<string, WorkspaceKitProgress>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [{ kits: nextKits }, workspace] = await Promise.all([api.listKits(), api.getWorkspaceOverview({ days: 7, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" })]);
      setKits(nextKits.filter((kit) => kit.status === "ready"));
      setProgress(new Map(workspace.kits.map((kit) => [kit.kitId, kit])));
    } catch (cause) { setError(apiErrorMessage(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <div aria-busy="true"><div className="h-3 w-28 animate-pulse rounded bg-line" /><div className="mt-4 h-9 w-72 animate-pulse rounded bg-line" /></div>;
  if (error) return <section className="mx-auto max-w-xl py-16 text-center"><p className="eyebrow">Practice unavailable</p><h1 className="mt-2 text-2xl font-semibold">We could not load your kits.</h1><p className="mt-3 text-sm text-muted-ink">{error}</p><Button className="mt-6" onClick={() => void load()}><RefreshCw size={16} />Try again</Button></section>;
  return <section><p className="eyebrow">Practice library</p><h1 className="mt-2 text-[clamp(1.75rem,4vw,2rem)] font-semibold tracking-tight">Pick a kit and start rehearsing.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-ink">Flashcards stay tied to the role they were generated for, so every practice session has the right context.</p><div className="mt-8 grid gap-3">{kits.length > 0 ? kits.map((kit) => { const metric = progress.get(kit.id); return <Card key={kit.id} className="group p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[15px] font-medium">{kit.roleTitle}</p><p className="mt-1 text-sm text-muted-ink">{kit.company}</p></div><StatusPill status="ready" /></div><div className="mt-6 flex flex-wrap items-center gap-4"><span className="inline-flex items-center gap-2 text-xs text-muted-ink"><BookOpenCheck size={15} />{metric ? `${metric.reviewedCards}/${metric.totalCards} cards reviewed` : "Practice material loading"}</span><Link href={`/dashboard/kits/${kit.id}?view=flashcards`} className="ml-auto"><Button size="sm">Practice this kit <ArrowRight size={15} /></Button></Link></div></Card>; }) : <Card className="p-6"><p className="text-sm text-muted-ink">No completed kits yet. Generate a kit first, then its flashcards will appear here.</p><Link href="/dashboard/new" className="mt-4 inline-flex text-sm font-medium text-signal">Create a kit <ArrowRight size={15} className="ml-1" /></Link></Card>}</div></section>;
}
