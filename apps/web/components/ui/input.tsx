import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "nx-focus flex h-10 w-full rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3.5 text-[13px] text-[var(--nx-ink)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.25)] transition-all duration-200 placeholder:text-[var(--nx-faint)] hover:border-[var(--nx-border-strong)] focus:border-[var(--nx-mint)] focus:shadow-[0_0_0_3px_rgba(128,128,135,0.28)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-xs font-semibold tracking-tight text-[var(--nx-ink)]",
        className,
      )}
      {...props}
    />
  );
}

function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role="alert"
      className={cn("mt-1.5 text-xs leading-relaxed text-[#e5a49e]", className)}
      {...props}
    />
  );
}

function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("mt-1.5 text-xs leading-relaxed text-[var(--nx-faint)]", className)}
      {...props}
    />
  );
}

export { Input, FieldLabel, FieldError, FieldHint };
