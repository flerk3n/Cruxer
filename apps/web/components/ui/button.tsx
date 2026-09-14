import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm" | "icon";
  loading?: boolean;
};

const styles = {
  primary: "bg-signal text-white hover:bg-signal-strong dark:text-ink",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-raised",
  ghost: "text-ink hover:bg-surface-raised",
  danger: "border border-danger/30 text-danger hover:bg-danger/10"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "default", loading, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-60",
        size === "sm" && "min-h-9 rounded-lg px-3",
        size === "icon" && "h-11 w-11 px-0",
        styles[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
});
