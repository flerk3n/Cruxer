"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
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
  return <section><div className="relative overflow-hidden rounded-[2rem] border bg-surface/75 px-6 py-7 shadow-[0_14px_45px_hsl(var(--ink)/0.06)] sm:px-8"><div className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-violet/15 blur-3xl" aria-hidden="true" /><div className="relative"><p className="workspace-kicker text-xs">Practice library</p><h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.05em]">Pick a kit and start rehearsing.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-ink">Flashcards stay tied to the role they were generated for, so every practice session has the right context.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-2">{kits.length > 0 ? kits.map((kit, index) => { const metric = progress.get(kit.id); return <motion.div key={kit.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: index * 0.05 }} whileHover={{ y: -3 }}><Card className="workspace-panel group h-full p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[15px] font-semibold">{kit.roleTitle}</p><p className="mt-1 text-sm text-muted-ink">{kit.company}</p></div><StatusPill status="ready" /></div><div className="mt-6 flex flex-wrap items-center gap-4"><span className="inline-flex items-center gap-2 text-xs text-muted-ink"><BookOpenCheck size={15} />{metric ? `${metric.reviewedCards}/${metric.totalCards} cards reviewed` : "Practice material loading"}</span><Link href={`/dashboard/kits/${kit.id}?view=flashcards`} className="ml-auto"><Button size="sm">Practice this kit <ArrowRight size={15} /></Button></Link></div></Card></motion.div>; }) : <Card className="workspace-panel p-6 md:col-span-2"><p className="text-sm text-muted-ink">No completed kits yet. Generate a kit first, then its flashcards will appear here.</p><Link href="/dashboard/new" className="mt-4 inline-flex text-sm font-medium text-signal">Create a kit <ArrowRight size={15} className="ml-1" /></Link></Card>}</div></section>;
}
