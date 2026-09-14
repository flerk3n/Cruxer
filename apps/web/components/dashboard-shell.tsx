"use client";

import Link from "next/link";
import { BrainCircuit, Command, House, Plus, Settings2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { CruxerLogo } from "@/components/cruxer-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { Dock, DockIcon } from "@/components/ui/dock";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/dashboard/new", label: "New kit", icon: Plus, prominent: true },
  { href: "/dashboard/practice", label: "Practice", icon: BrainCircuit },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 }
];

function activePath(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href || pathname.startsWith("/dashboard/kits/") : pathname.startsWith(href);
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="workspace-app min-h-screen overflow-x-clip"><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] rounded-xl bg-surface px-3 py-2 shadow-ambient">Skip to content</a><div className="workspace-aurora pointer-events-none fixed inset-0" aria-hidden="true" /><header className="relative z-10 mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between px-4 sm:px-7 lg:px-10"><CruxerLogo /><div className="flex items-center gap-1.5 sm:gap-2"><CommandPalette /><button type="button" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} className="grid h-10 w-10 place-items-center rounded-xl text-muted-ink transition hover:bg-surface/80 hover:text-ink lg:hidden" aria-label="Open command menu"><Command size={18} /></button><ThemeToggle /><span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-[11px] font-bold text-canvas shadow-sm" aria-label="Signed in user">U</span></div></header><main id="main" className="page-frame relative z-10 pb-32 pt-4 sm:pt-7 lg:pb-36">{children}</main><nav className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 sm:bottom-6" aria-label="Workspace navigation"><Dock iconSize={46} iconMagnification={62} iconDistance={150} className="pointer-events-auto mt-0 gap-1 rounded-[1.35rem] border-line/80 bg-surface/85 p-2 shadow-[0_18px_55px_hsl(var(--ink)/0.18)] backdrop-blur-2xl">{nav.map(({ href, label, icon: Icon, prominent }) => { const active = activePath(pathname, href); return <DockIcon key={href} className={cn("text-muted-ink", active && "bg-violet/12 text-violet", prominent && "bg-signal text-white shadow-[0_8px_20px_hsl(var(--signal)/0.28)]") }><Link href={href} aria-current={active ? "page" : undefined} aria-label={label} title={label} className="grid h-full w-full place-items-center rounded-full outline-none"><Icon size={19} strokeWidth={active || prominent ? 2.5 : 2} /><span className="sr-only">{label}</span></Link></DockIcon>; })}</Dock></nav></div>;
}
