import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-medium text-ink">{children}</label>;
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-xs text-muted-ink">{children}</p>;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props }, ref
) {
  return <input ref={ref} className={cn("min-h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted-ink/75 hover:border-muted-ink/50 focus:border-signal focus:outline-none", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props }, ref
) {
  return <textarea ref={ref} className={cn("min-h-40 w-full resize-y rounded-xl border bg-surface px-3.5 py-3 text-[15px] leading-relaxed text-ink placeholder:text-muted-ink/75 hover:border-muted-ink/50 focus:border-signal focus:outline-none", className)} {...props} />;
});
