"use client";

import Link from "next/link";
import { BrainCircuit, Command, CreditCard, House, MailWarning, Plus, Settings2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountProvider, useAccount } from "@/components/account-provider";
import { CruxerLogo } from "@/components/cruxer-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { Dock, DockIcon } from "@/components/ui/dock";
import { api, apiErrorMessage } from "@/lib/api";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/dashboard/new", label: "New kit", icon: Plus },
  { href: "/dashboard/practice", label: "Practice", icon: BrainCircuit },
  { href: "/dashboard/billing", label: "Plan & billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 }
];

function activePath(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href || pathname.startsWith("/dashboard/kits/") : pathname.startsWith(href);
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return <AccountProvider><Shell>{children}</Shell></AccountProvider>;
}

function UsageChip() {
  const { billing } = useAccount();
  if (!billing) return null;
  const { plan, kits } = billing.usage;
  const remaining = Math.max(0, kits.limit - kits.used);
  return <Link href="/dashboard/billing" className={cn("hidden items-center gap-2 rounded-full border bg-surface/70 px-3 py-1.5 text-xs font-semibold transition hover:bg-surface sm:inline-flex", remaining === 0 ? "border-warning/40 text-warning" : "text-muted-ink")} title="Kits remaining this period"><span className={cn("rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide", plan === "pro" ? "bg-violet/12 text-violet" : "bg-line/70 text-muted-ink")}>{plan}</span>{kits.used}/{kits.limit} kits</Link>;
}

function VerifyEmailBanner() {
  const { user } = useAccount();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  if (!user || user.emailVerified) return null;
  async function resend() {
    setState("sending");
    try {
      await api.resendVerification();
      track("verification_resent");
      setState("sent");
      setMessage("Verification email sent. Check your inbox.");
    } catch (cause) {
      setState("error");
      setMessage(apiErrorMessage(cause));
    }
  }
  return <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm" role="status"><MailWarning size={18} className="shrink-0 text-warning" /><p className="min-w-0 flex-1 text-ink">Verify <span className="font-semibold">{user.email}</span> to generate kits and upgrade. {message && <span className="text-muted-ink">{message}</span>}</p><button type="button" onClick={() => void resend()} disabled={state === "sending" || state === "sent"} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold transition hover:bg-surface-raised disabled:opacity-60">{state === "sending" ? "Sending…" : state === "sent" ? "Sent" : "Resend email"}</button></div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAccount();
  const profileInitial = (user?.name.trim() || user?.email.trim() || "U").charAt(0).toUpperCase();
  const profileLabel = user?.name ? `Signed in as ${user.name}` : "Signed in user";
  return <div className="workspace-app min-h-screen overflow-x-clip"><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] rounded-xl bg-surface px-3 py-2 shadow-ambient">Skip to content</a><div className="workspace-aurora pointer-events-none fixed inset-0" aria-hidden="true" /><header className="relative z-10 mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between px-4 sm:px-7 lg:px-10"><CruxerLogo /><div className="flex items-center gap-1.5 sm:gap-2"><UsageChip /><CommandPalette /><button type="button" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} className="grid h-10 w-10 place-items-center rounded-xl text-muted-ink transition hover:bg-surface/80 hover:text-ink lg:hidden" aria-label="Open command menu"><Command size={18} /></button><ThemeToggle /><span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-[11px] font-bold text-canvas shadow-sm" aria-label={profileLabel} title={profileLabel}>{profileInitial}</span></div></header><main id="main" className="page-frame relative z-10 pb-36 pt-4 sm:pt-7 lg:pb-40"><VerifyEmailBanner />{children}</main><nav className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 sm:bottom-6" aria-label="Workspace navigation"><Dock iconSize={50} iconMagnification={72} iconDistance={130} className="pointer-events-auto mt-0 gap-3 rounded-[1.55rem] border-line/80 bg-surface/85 p-3 shadow-[0_18px_55px_hsl(var(--ink)/0.18)] backdrop-blur-2xl">{nav.map(({ href, label, icon: Icon }) => { const active = activePath(pathname, href); return <DockIcon key={href} className={cn("text-muted-ink transition-colors duration-150 hover:bg-signal hover:text-white hover:shadow-[0_8px_20px_hsl(var(--signal)/0.28)] focus-within:bg-signal focus-within:text-white focus-within:shadow-[0_8px_20px_hsl(var(--signal)/0.28)]", active && "bg-violet/12 text-violet") }><Link href={href} aria-current={active ? "page" : undefined} aria-label={label} className="grid h-full w-full place-items-center rounded-full outline-none"><Icon size={21} strokeWidth={active ? 2.5 : 2} /><span className="pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line/80 bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-ink opacity-0 shadow-lg backdrop-blur transition duration-150 group-hover/dock-icon:-translate-y-0.5 group-hover/dock-icon:opacity-100 group-focus-within/dock-icon:-translate-y-0.5 group-focus-within/dock-icon:opacity-100">{label}</span></Link></DockIcon>; })}</Dock></nav></div>;
}
