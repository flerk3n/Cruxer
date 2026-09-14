"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { api, apiErrorMessage, isUnauthenticated, type KitSummary, type User } from "@/lib/api";

type ScreenState = "loading" | "ready" | "error";

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Updated ${hours}h ago`;
}

function daysAvailable(kit: KitSummary): string {
  // The summary endpoint does not expose the interview window; show the reliable
  // persisted update signal instead of inventing a countdown.
  return kit.status === "generating" ? "Generation in progress" : "Preparation kit";
}

export function DashboardOverview() {
  const [state, setState] = useState<ScreenState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const [{ user: sessionUser }, { kits: nextKits }] = await Promise.all([api.session(), api.listKits()]);
      setUser(sessionUser);
      setKits(nextKits);
      setState("ready");
    } catch (cause) {
      if (isUnauthenticated(cause)) {
        window.location.assign("/login");
        return;
      }
      setError(apiErrorMessage(cause));
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (state === "loading") return <DashboardSkeleton />;
  if (state === "error") return <section className="mx-auto max-w-xl py-16 text-center"><p className="eyebrow">Workspace unavailable</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">We could not load your kits.</h1><p className="mt-3 text-sm text-muted-ink">{error}</p><Button className="mt-6" onClick={() => void load()}><RefreshCw size={16} />Try again</Button></section>;

  const firstName = user?.email.split("@")[0] || "there";
  return <><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Your preparation workspace</p><h1 className="mt-2 text-[clamp(1.75rem,4vw,2rem)] font-semibold tracking-tight">Welcome back, {firstName}.</h1><p className="mt-2 text-sm text-muted-ink">Focus on the role that matters next.</p></div><Link href="/dashboard/new"><Button><Plus size={16} />Create a kit</Button></Link></div>
    <section className="mt-10"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold tracking-tight">Your kits</h2><span className="text-xs text-muted-ink">{kits.length} {kits.length === 1 ? "kit" : "kits"}</span></div>
      {kits.length === 0 ? <EmptyState /> : <div className="grid gap-3">{kits.map((kit) => <KitRow key={kit.id} kit={kit} />)}</div>}
    </section>
  </>;
}

function KitRow({ kit }: { kit: KitSummary }) {
  const status = kit.status === "ready" ? "ready" : kit.status === "generating" ? "researching" : kit.status === "failed" ? "attention" : "partial";
  return <Card className="group p-5 transition duration-150 hover:-translate-y-0.5 hover:bg-surface-raised"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[15px] font-medium">{kit.roleTitle || "Untitled role"}</p><p className="mt-1 text-sm text-muted-ink">{kit.company || "Company research pending"}</p></div><StatusPill status={status} /></div><div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-ink"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />{daysAvailable(kit)}</span><span className="inline-flex items-center gap-1.5"><Clock3 size={14} />{relativeTime(kit.updatedAt)}</span><Link href={`/dashboard/kits/${kit.id}`} className="ml-auto inline-flex items-center gap-1.5 font-medium text-ink group-hover:text-signal">{kit.status === "generating" ? "View progress" : "Open kit"} <ArrowRight size={14} /></Link></div></Card>;
}

function EmptyState() { return <Card className="overflow-hidden p-6 sm:p-8"><p className="editorial-title max-w-xl text-3xl leading-none">Give Cruxer a role, a company, and the time you have.</p><p className="mt-4 max-w-lg text-sm leading-6 text-muted-ink">It will make its research and coverage visible so you know exactly what you are preparing for.</p><Link href="/dashboard/new" className="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-signal hover:text-signal-strong">Start a new kit <ArrowRight size={15} /></Link></Card>; }

function DashboardSkeleton() { return <div aria-busy="true" aria-label="Loading your workspace"><div className="h-3 w-36 animate-pulse rounded bg-line" /><div className="mt-4 h-9 w-72 max-w-full animate-pulse rounded bg-line" /><div className="mt-12 space-y-3">{[0, 1].map((item) => <Card key={item} className="h-36 animate-pulse bg-surface-raised"><span className="sr-only">Loading kit</span></Card>)}</div></div>; }
