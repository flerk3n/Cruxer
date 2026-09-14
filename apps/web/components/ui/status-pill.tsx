import { AlertTriangle, CheckCircle2, CircleDotDashed, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const state = {
  ready: { label: "Ready", icon: CheckCircle2, className: "bg-success/10 text-success" },
  researching: { label: "Researching", icon: CircleDotDashed, className: "bg-violet/10 text-violet" },
  partial: { label: "Partial research", icon: AlertTriangle, className: "bg-warning/10 text-warning" },
  attention: { label: "Needs attention", icon: AlertTriangle, className: "bg-danger/10 text-danger" }
} as const;

export function StatusPill({ status, className }: { status: keyof typeof state; className?: string }) {
  const item = state[status];
  const Icon: LucideIcon = item.icon;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", item.className, className)}><Icon size={14} aria-hidden="true" />{item.label}</span>;
}
