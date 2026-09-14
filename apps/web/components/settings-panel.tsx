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
  return <section className="mx-auto max-w-2xl"><p className="eyebrow">Workspace settings</p><h1 className="mt-2 text-[clamp(1.75rem,4vw,2rem)] font-semibold tracking-tight">Make Cruxer yours.</h1><p className="mt-2 text-sm leading-6 text-muted-ink">Account and display preferences are kept deliberately simple.</p><div className="mt-8 space-y-4"><Card className="p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-success" size={18} /><div><p className="font-medium">Account</p><p className="mt-1 text-sm text-muted-ink">{user?.email ?? "Loading account…"}</p></div></div></Card><Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"><div className="flex items-start gap-3"><MonitorCog className="mt-0.5 text-violet" size={18} /><div><p className="font-medium">Appearance</p><p className="mt-1 text-sm text-muted-ink">Choose the theme that feels easiest to work in.</p></div></div><ThemeToggle /></Card><Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"><div><p className="font-medium">Session</p><p className="mt-1 text-sm text-muted-ink">Sign out of this browser when you are finished.</p></div><Button variant="secondary" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} />{signingOut ? "Signing out…" : "Sign out"}</Button></Card></div>{error && <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">{error}</p>}</section>;
}
