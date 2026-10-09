"use client";

import { CalendarClock, Check, CreditCard, LoaderCircle, Mic, Sparkles, Layers3 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account-provider";
import { useToast } from "@/components/toast-provider";
import { useUpgrade } from "@/components/upgrade-prompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, apiErrorMessage, type UsageSummary } from "@/lib/api";
import { track } from "@/lib/analytics";
import { PRICING } from "@/lib/plans";
import { cn } from "@/lib/utils";

const CHECKOUT_POLL_MS = 2_500;
const CHECKOUT_POLL_LIMIT = 24;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function BillingPanel() {
  const { billing, refresh } = useAccount();
  const { notify } = useToast();
  const params = useSearchParams();
  const returning = params.get("checkout") === "return";
  const [confirming, setConfirming] = useState(returning);
  const [portalPending, setPortalPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { upgrade, pending: upgrading, error: upgradeError } = useUpgrade("billing_page");
  const polls = useRef(0);
  const usage = billing?.usage;

  // Dodo confirms the subscription by webhook, which can land a few seconds after the redirect.
  useEffect(() => {
    if (!confirming) return;
    if (usage?.plan === "pro") {
      setConfirming(false);
      track("checkout_completed");
      notify("Welcome to Cruxer Pro. Your new limits are active.");
      window.history.replaceState(null, "", "/dashboard/billing");
      return;
    }
    if (polls.current >= CHECKOUT_POLL_LIMIT) { setConfirming(false); return; }
    const timer = window.setTimeout(() => { polls.current += 1; void refresh(); }, CHECKOUT_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [confirming, billing, usage?.plan, refresh, notify]);

  async function openPortal() {
    setPortalPending(true);
    setError(null);
    try {
      const { url } = await api.openBillingPortal();
      track("billing_portal_opened");
      window.location.assign(url);
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setPortalPending(false);
    }
  }

  const pro = usage?.plan === "pro";
  // A subscription paused for payment is restored in the portal, not with a second checkout.
  const manageable = pro || ["on_hold", "past_due", "paused"].includes(usage?.subscription?.status ?? "");
  return <section className="mx-auto max-w-4xl">
    <div className="relative overflow-hidden rounded-[2rem] border bg-surface/75 px-6 py-7 shadow-[0_14px_45px_hsl(var(--ink)/0.06)] sm:px-8"><div className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-violet/15 blur-3xl" aria-hidden="true" /><div className="relative"><p className="workspace-kicker text-xs">Plan & billing</p><h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.05em]">{pro ? "You're on Pro." : "Your plan"}</h1><p className="mt-2 text-sm leading-6 text-muted-ink">Usage resets at the start of each {pro ? "billing period" : "calendar month (UTC)"}.</p></div></div>

    {confirming && <div className="mt-5 flex items-center gap-3 rounded-2xl border border-violet/25 bg-violet/[0.06] px-4 py-3 text-sm" role="status"><LoaderCircle size={17} className="animate-spin text-violet" />Confirming your payment with Dodo Payments…</div>}
    {returning && !confirming && !pro && <div className="mt-5 rounded-2xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm" role="status">We haven&apos;t received confirmation yet. If you completed payment, refresh in a minute; it can take a moment to arrive.</div>}
    {params.get("checkout") === "cancelled" && <div className="mt-5 rounded-2xl border bg-surface/70 px-4 py-3 text-sm text-muted-ink" role="status">Checkout was cancelled. You have not been charged.</div>}

    {!usage ? <Card className="workspace-panel mt-5 p-6"><p className="text-sm text-muted-ink">Loading your plan…</p></Card> : <div className="mt-5 grid gap-4">
      <Card className="workspace-panel p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><span className={cn("grid h-11 w-11 place-items-center rounded-xl", pro ? "bg-violet/12 text-violet" : "bg-line/60 text-muted-ink")}>{pro ? <Sparkles size={19} /> : <CreditCard size={19} />}</span><div><p className="text-lg font-semibold">{pro ? `Pro · $${PRICING.pro.price}/month` : "Free"}</p><p className="mt-1 text-sm text-muted-ink">{subscriptionLine(usage)}</p></div></div>
        {manageable ? <Button variant="secondary" onClick={() => void openPortal()} loading={portalPending} disabled={!billing?.billingEnabled}>Manage billing</Button> : <Button onClick={() => void upgrade()} loading={upgrading} disabled={!billing?.billingEnabled}>Upgrade to Pro · ${PRICING.pro.price}/month</Button>}
      </div>{(error || upgradeError) && <p role="alert" className="mt-4 text-sm text-danger">{error ?? upgradeError}</p>}{billing && !billing.billingEnabled && <p className="mt-4 text-xs text-muted-ink">Upgrades are temporarily unavailable.</p>}</Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <UsageMeter icon={<Layers3 size={17} />} label="Kit generations" used={usage.kits.used} limit={usage.kits.limit} unit="kits" resetsAt={usage.resetsAt} />
        {usage.mockSeconds.limit > 0
          ? <UsageMeter icon={<Mic size={17} />} label="Live mock interview" used={Math.ceil(usage.mockSeconds.used / 60)} limit={Math.floor(usage.mockSeconds.limit / 60)} unit="minutes" resetsAt={usage.resetsAt} note={`Up to ${Math.floor(usage.maxMockSessionSeconds / 60)} minutes per session.`} />
          : <Card className="workspace-panel p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Mic size={17} className="text-muted-ink" />Live mock interview</div><p className="mt-3 text-sm leading-6 text-muted-ink">Voice mock interviews are included with Pro: {PRICING.pro.mockMinutes} minutes a month.</p></Card>}
      </div>

      <Card className="workspace-panel overflow-hidden"><div className="grid sm:grid-cols-2">{(["free", "pro"] as const).map((id) => <PlanColumn key={id} id={id} current={usage.plan === id} />)}</div></Card>
    </div>}
  </section>;
}

function subscriptionLine(usage: UsageSummary) {
  const subscription = usage.subscription;
  if (usage.plan === "pro" && subscription) {
    if (subscription.cancelAtPeriodEnd || subscription.status === "cancelled") return `Cancelled · Pro access until ${formatDate(subscription.currentPeriodEnd)}`;
    return `Renews on ${formatDate(subscription.currentPeriodEnd)}`;
  }
  if (subscription?.status === "on_hold" || subscription?.status === "past_due") return "Your last payment failed. Update your card to restore Pro.";
  return `${usage.kits.limit} kits a month, no card required.`;
}

function UsageMeter({ icon, label, used, limit, unit, resetsAt, note }: { icon: React.ReactNode; label: string; used: number; limit: number; unit: string; resetsAt: string; note?: string }) {
  const percent = limit === 0 ? 100 : Math.min(100, Math.round(used / limit * 100));
  const exhausted = used >= limit;
  return <Card className="workspace-panel p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold"><span className="text-muted-ink">{icon}</span>{label}</div><span className={cn("font-mono text-sm font-semibold", exhausted ? "text-warning" : "text-ink")}>{Math.min(used, limit)}/{limit}</span></div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-line/60" role="progressbar" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}><div className={cn("h-full rounded-full transition-all", exhausted ? "bg-warning" : "bg-signal")} style={{ width: `${percent}%` }} /></div>
    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-ink"><CalendarClock size={13} />{Math.max(0, limit - used)} {unit} left · resets {formatDate(resetsAt)}</p>{note && <p className="mt-1 text-xs text-muted-ink">{note}</p>}</Card>;
}

function PlanColumn({ id, current }: { id: "free" | "pro"; current: boolean }) {
  const plan = PRICING[id];
  const features = id === "pro"
    ? [`${plan.kits} kit generations a month`, `${PRICING.pro.mockMinutes} minutes of live voice mock interviews`, `${plan.regenerationsPerKit} regenerations per kit`, "Practice, flashcards and editing"]
    : [`${plan.kits} kit generations a month`, "No live mock interviews", `${plan.regenerationsPerKit} regenerations per kit`, "Practice, flashcards and editing"];
  return <div className={cn("p-5 sm:p-6", id === "pro" && "border-t bg-violet/[0.04] sm:border-l sm:border-t-0")}><div className="flex items-center justify-between"><p className="font-semibold">{plan.name}</p>{current && <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">Current</span>}</div><p className="mt-2 text-2xl font-semibold tracking-tight">${plan.price}<span className="text-sm font-medium text-muted-ink">/month</span></p><ul className="mt-4 space-y-2 text-sm text-muted-ink">{features.map((feature) => <li key={feature} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-success" />{feature}</li>)}</ul></div>;
}
