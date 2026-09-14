import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProgressStep = { id: string; label: string; detail?: string; state: "complete" | "active" | "pending" | "warning" };

export function ProgressRail({ steps, className }: { steps: ProgressStep[]; className?: string }) {
  return <ol className={cn("space-y-0", className)} aria-label="Generation progress">{steps.map((step, index) => <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0"><div className="flex w-5 flex-col items-center"><span className={cn("grid h-5 w-5 place-items-center rounded-full border text-[10px]", step.state === "complete" && "border-success bg-success text-white", step.state === "active" && "border-violet bg-violet text-white", step.state === "warning" && "border-warning bg-warning/10 text-warning", step.state === "pending" && "bg-surface text-muted-ink")}>{step.state === "complete" ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{index < steps.length - 1 && <span className={cn("mt-1 w-px flex-1 bg-line", step.state === "complete" && "bg-success/50")} />}</div><div className="-mt-0.5 pb-0.5"><p className={cn("text-[13px] font-medium", step.state === "pending" ? "text-muted-ink" : "text-ink")}>{step.label}</p>{step.detail && <p className="mt-0.5 text-xs text-muted-ink" aria-live={step.state === "active" ? "polite" : undefined}>{step.detail}</p>}</div></li>)}</ol>;
}
