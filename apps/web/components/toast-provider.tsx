"use client";

import { Check, Info, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "info";
type Toast = { id: number; message: string; tone: ToastTone };
type ToastContextValue = { notify: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextValue>({ notify: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduceMotion = useReducedMotion();
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => dismiss(id), 4200);
  }, [dismiss]);
  const value = useMemo(() => ({ notify }), [notify]);

  return <ToastContext.Provider value={value}>{children}<div className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex justify-center sm:top-6" aria-live="polite" aria-atomic="true"><div className="flex w-full max-w-sm flex-col gap-2">{<AnimatePresence initial={false}>{toasts.map((toast) => <motion.div key={toast.id} initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.18, ease: "easeOut" }} className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-line/80 bg-surface/95 px-4 py-3 text-sm shadow-[0_18px_60px_hsl(var(--ink)/0.18)] backdrop-blur-xl"><span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", toast.tone === "success" ? "bg-success/12 text-success" : "bg-violet/12 text-violet")}>{toast.tone === "success" ? <Check size={15} /> : <Info size={15} />}</span><p className="flex-1 font-medium text-ink">{toast.message}</p><button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted-ink transition hover:bg-surface-raised hover:text-ink" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification"><X size={15} /></button></motion.div>)}</AnimatePresence>}</div></div></ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}
