"use client";

import Link from "next/link";
import { BrainCircuit, Command, House, Plus, Settings2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CruxerLogo } from "@/components/cruxer-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { Dock, DockIcon } from "@/components/ui/dock";
import { api, type User } from "@/lib/api";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/dashboard/new", label: "New kit", icon: Plus },
  { href: "/dashboard/practice", label: "Practice", icon: BrainCircuit },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 }
];

function activePath(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href || pathname.startsWith("/dashboard/kits/") : pathname.startsWith(href);
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { void api.session().then(({ user: sessionUser }) => setUser(sessionUser)).catch(() => setUser(null)); }, []);
  const profileInitial = (user?.name.trim() || user?.email.trim() || "U").charAt(0).toUpperCase();
  const profileLabel = user?.name ? `Signed in as ${user.name}` : "Signed in user";
  return <div className="workspace-app min-h-screen overflow-x-clip"><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] rounded-xl bg-surface px-3 py-2 shadow-ambient">Skip to content</a><div className="workspace-aurora pointer-events-none fixed inset-0" aria-hidden="true" /><header className="relative z-10 mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between px-4 sm:px-7 lg:px-10"><CruxerLogo /><div className="flex items-center gap-1.5 sm:gap-2"><CommandPalette /><button type="button" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} className="grid h-10 w-10 place-items-center rounded-xl text-muted-ink transition hover:bg-surface/80 hover:text-ink lg:hidden" aria-label="Open command menu"><Command size={18} /></button><ThemeToggle /><span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-[11px] font-bold text-canvas shadow-sm" aria-label={profileLabel} title={profileLabel}>{profileInitial}</span></div></header><main id="main" className="page-frame relative z-10 pb-36 pt-4 sm:pt-7 lg:pb-40">{children}</main><nav className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 sm:bottom-6" aria-label="Workspace navigation"><Dock iconSize={50} iconMagnification={72} iconDistance={130} className="pointer-events-auto mt-0 gap-3 rounded-[1.55rem] border-line/80 bg-surface/85 p-3 shadow-[0_18px_55px_hsl(var(--ink)/0.18)] backdrop-blur-2xl">{nav.map(({ href, label, icon: Icon }) => { const active = activePath(pathname, href); return <DockIcon key={href} className={cn("text-muted-ink transition-colors duration-150 hover:bg-signal hover:text-white hover:shadow-[0_8px_20px_hsl(var(--signal)/0.28)] focus-within:bg-signal focus-within:text-white focus-within:shadow-[0_8px_20px_hsl(var(--signal)/0.28)]", active && "bg-violet/12 text-violet") }><Link href={href} aria-current={active ? "page" : undefined} aria-label={label} className="grid h-full w-full place-items-center rounded-full outline-none"><Icon size={21} strokeWidth={active ? 2.5 : 2} /><span className="pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line/80 bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-ink opacity-0 shadow-lg backdrop-blur transition duration-150 group-hover/dock-icon:-translate-y-0.5 group-hover/dock-icon:opacity-100 group-focus-within/dock-icon:-translate-y-0.5 group-focus-within/dock-icon:opacity-100">{label}</span></Link></DockIcon>; })}</Dock></nav></div>;
}
