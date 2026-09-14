"use client";

import Link from "next/link";
import { BookOpenCheck, Command, LayoutDashboard, Plus, Settings } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { CruxerLogo } from "@/components/cruxer-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/new", label: "New kit", icon: Plus, prominent: true },
  { href: "/dashboard/practice", label: "Practice", icon: BookOpenCheck },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

function activePath(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href || pathname.startsWith("/dashboard/kits/") : pathname.startsWith(href);
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  return <div className="workspace-app min-h-screen overflow-x-clip"><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] rounded-xl bg-surface px-3 py-2 shadow-ambient">Skip to content</a><div className="workspace-aurora pointer-events-none fixed inset-0" aria-hidden="true" /><header className="relative z-10 mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between px-4 sm:px-7 lg:px-10"><CruxerLogo /><div className="flex items-center gap-1.5 sm:gap-2"><CommandPalette /><button type="button" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} className="grid h-10 w-10 place-items-center rounded-xl text-muted-ink transition hover:bg-surface/80 hover:text-ink lg:hidden" aria-label="Open command menu"><Command size={18} /></button><ThemeToggle /><span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-[11px] font-bold text-canvas shadow-sm" aria-label="Signed in user">U</span></div></header><main id="main" className="page-frame relative z-10 pb-32 pt-4 sm:pt-7 lg:pb-36">{children}</main><motion.nav initial={reduceMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.08, ease: "easeOut" }} className="dock-shell fixed inset-x-3 bottom-3 z-40 mx-auto flex w-auto max-w-[31rem] items-center justify-between p-1.5 sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[31rem] sm:-translate-x-1/2" aria-label="Workspace navigation">{nav.map(({ href, label, icon: Icon, prominent }) => { const active = activePath(pathname, href); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("group relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[10px] font-semibold transition", prominent ? "text-white" : active ? "text-ink" : "text-muted-ink hover:text-ink", prominent && "mx-0.5 bg-signal shadow-[0_9px_20px_hsl(var(--signal)/0.26)] hover:bg-signal-strong")}>{!prominent && active && <motion.span layoutId="dock-active" className="absolute inset-0 rounded-xl bg-surface-raised shadow-sm" transition={{ type: "spring", stiffness: 440, damping: 34 }} />}<Icon className="relative" size={18} strokeWidth={active || prominent ? 2.4 : 2} /><span className="relative">{label}</span></Link>; })}</motion.nav></div>;
}
