import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "nx-focus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[13px] font-semibold tracking-tight transition-all duration-200 outline-none select-none disabled:pointer-events-none disabled:opacity-45 active:scale-[0.985] [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-[var(--nx-signal)] text-[var(--nx-signal-ink)] shadow-none hover:opacity-85",
        secondary:
          "border border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-ink)] hover:border-[var(--nx-border-strong)] hover:bg-[var(--nx-raised)]",
        ghost: "text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]",
        danger:
          "border border-[var(--nx-border)] bg-transparent text-[var(--nx-bad)] hover:border-[var(--nx-bad)] hover:bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)]",
        link: "text-[var(--nx-ink)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-9.5 px-4 py-2 min-h-[38px]",
        lg: "h-11 px-6 text-sm rounded-2xl",
        icon: "size-9 rounded-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  href?: string;
}

const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  ({ className, variant, size, href, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (href) {
      const { onClick, ...rest } = props as React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        onClick?: React.MouseEventHandler<HTMLAnchorElement>;
      };
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={classes}
          onClick={onClick}
          {...rest}
        />
      );
    }
    return <button ref={ref as React.Ref<HTMLButtonElement>} className={classes} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
