"use client";

import { useEffect, useState } from "react";
import { LogOut, MonitorCog, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, apiErrorMessage, type User } from "@/lib/api";

export function SettingsPanel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { void api.session().then(({ user: next }) => setUser(next)).catch((cause) => setError(apiErrorMessage(cause))); }, []);
  async function signOut() { setSigningOut(true); try { await api.logout(); router.replace("/login"); router.refresh(); } catch (cause) { setError(apiErrorMessage(cause)); setSigningOut(false); } }
  return <section className="mx-auto max-w-3xl"><div className="relative overflow-hidden rounded-[2rem] border bg-surface/75 px-6 py-7 shadow-[0_14px_45px_hsl(var(--ink)/0.06)] sm:px-8"><div className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-signal/15 blur-3xl" aria-hidden="true" /><div className="relative"><p className="workspace-kicker text-xs">Workspace settings</p><h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.05em]">Make Cruxer yours.</h1><p className="mt-2 text-sm leading-6 text-muted-ink">Account and display preferences are kept deliberately simple.</p></div></div><div className="mt-5 grid gap-3"><Card className="workspace-panel p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-success/10 text-success"><ShieldCheck size={18} /></span><div><p className="font-semibold">Account</p><p className="mt-1 text-sm text-muted-ink">{user?.email ?? "Loading account…"}</p></div></div></Card><Card className="workspace-panel flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet/10 text-violet"><MonitorCog size={18} /></span><div><p className="font-semibold">Appearance</p><p className="mt-1 text-sm text-muted-ink">Choose the theme that feels easiest to work in.</p></div></div><ThemeToggle /></Card><Card className="workspace-panel flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"><div><p className="font-semibold">Session</p><p className="mt-1 text-sm text-muted-ink">Sign out of this browser when you are finished.</p></div><Button variant="secondary" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} />{signingOut ? "Signing out…" : "Sign out"}</Button></Card></div>{error && <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">{error}</p>}</section>;
}
