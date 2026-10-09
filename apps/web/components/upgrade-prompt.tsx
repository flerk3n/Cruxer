"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, apiErrorMessage } from "@/lib/api";
import { track } from "@/lib/analytics";
import { PRICING } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** Starts Dodo checkout. The browser leaves Cruxer for the hosted payment page. */
export function useUpgrade(source: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upgrade() {
    setPending(true);
    setError(null);
    track("upgrade_clicked", { source });
    try {
      const { checkoutUrl } = await api.startCheckout();
      track("checkout_started", { source });
      window.location.assign(checkoutUrl);
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setPending(false);
    }
  }
  return { upgrade, pending, error };
}

export function UpgradePrompt({ title, message, source, resetsAt, className }: { title: string; message: string; source: string; resetsAt?: string; className?: string }) {
  const { upgrade, pending, error } = useUpgrade(source);
  const reset = resetsAt ? new Date(resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return <div className={cn("rounded-2xl border border-violet/25 bg-violet/[0.06] p-5", className)} role="status">
    <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet/12 text-violet"><Sparkles size={17} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{title}</p><p className="mt-1 text-sm leading-6 text-muted-ink">{message}{reset ? ` Your allowance resets on ${reset}.` : ""}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button size="sm" onClick={() => void upgrade()} loading={pending}>Upgrade to Pro · ${PRICING.pro.price}/month</Button><Link href="/pricing" className="text-xs font-semibold text-muted-ink underline-offset-4 hover:text-ink hover:underline">Compare plans</Link></div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </div></div>
  </div>;
}
