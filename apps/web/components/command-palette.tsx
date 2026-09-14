"use client";

import { Command, LayoutDashboard, Plus, BookOpenCheck, Settings, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const actions = [
  { label: "Open dashboard", hint: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Create a new kit", hint: "New kit", href: "/dashboard/new", icon: Plus },
  { label: "Choose a practice kit", hint: "Practice", href: "/dashboard/practice", icon: BookOpenCheck },
  { label: "Open settings", hint: "Settings", href: "/dashboard/settings", icon: Settings }
];

export function CommandPalette() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const reduceMotion = useReducedMotion();
  const matches = useMemo(() => actions.filter((action) => `${action.label} ${action.hint}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())), [query]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) window.setTimeout(() => input.current?.focus(), 0); else setQuery(""); }, [open]);
  function choose(href: string) { setOpen(false); router.push(href); }
  return <><button type="button" onClick={() => setOpen(true)} className="hidden min-h-10 items-center gap-2 rounded-xl border border-transparent px-3 text-xs text-muted-ink transition hover:border-line hover:bg-surface/75 hover:text-ink lg:flex" aria-label="Open command menu"><Command size={14} />Search <kbd className="rounded-md border bg-canvas px-1.5 py-0.5 font-mono text-[11px]">⌘ K</kbd></button><AnimatePresence>{open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-50 grid place-items-start bg-ink/30 px-4 pt-[12vh] backdrop-blur-sm" role="presentation" onMouseDown={() => setOpen(false)}><motion.section initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.18, ease: "easeOut" }} className="w-full max-w-xl overflow-hidden rounded-[1.4rem] border bg-surface/95 shadow-[0_24px_80px_hsl(var(--ink)/0.22)] backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Command menu" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b px-4"><Search size={17} className="text-signal" /><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspace actions…" className="h-16 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-ink" /><button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink transition hover:bg-surface-raised hover:text-ink" aria-label="Close command menu"><X size={16} /></button></div><div className="p-2">{matches.length > 0 ? matches.map((action) => { const Icon = action.icon; return <button key={action.href} type="button" onClick={() => choose(action.href)} className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition hover:bg-surface-raised")}><span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/10 text-signal"><Icon size={16} /></span><span className="flex-1 text-sm font-semibold">{action.label}</span><span className="text-xs text-muted-ink">{action.hint}</span></button>; }) : <p className="px-3 py-6 text-sm text-muted-ink">No workspace actions match “{query}”.</p>}</div><p className="border-t px-4 py-3 text-xs text-muted-ink">Press Esc to close · Use ⌘K or Ctrl+K from anywhere in the workspace.</p></motion.section></motion.div>}</AnimatePresence></>;
}
