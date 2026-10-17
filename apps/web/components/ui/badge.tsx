import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-mono text-[10px] font-medium tracking-[0.08em] uppercase transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-[var(--nx-border)] bg-[var(--nx-raised)] text-[var(--nx-muted)]",
        success: "border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-ink)]",
        warning: "border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-ink)]",
        danger:
          "border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_10%,transparent)] text-[var(--nx-bad)]",
        info: "border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-muted)]",
        accent: "border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-ink)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
