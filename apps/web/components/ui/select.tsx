"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

const triggerVariants = cva(
  "nx-focus inline-flex w-full max-w-full items-center gap-2 rounded-xl text-[13px] font-medium tracking-tight transition-colors disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        surface:
          "border border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-ink)] hover:border-[var(--nx-border-strong)]",
        inset:
          "border border-[var(--nx-border)] bg-[var(--nx-inset)] text-[var(--nx-ink)] hover:border-[var(--nx-border-strong)]",
        ghost: "bg-transparent text-[var(--nx-ink)]",
      },
      size: {
        md: "h-10 px-3",
        sm: "h-9 px-3",
        xs: "h-8 px-1.5",
      },
    },
    defaultVariants: { variant: "surface", size: "md" },
  },
);

export interface SelectProps extends VariantProps<typeof triggerVariants> {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  id?: string;
  name?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  name,
  icon,
  placeholder = "Select…",
  emptyLabel = "No options",
  disabled,
  variant,
  size,
  className,
  triggerClassName,
  panelClassName,
}: SelectProps) {
  const listId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const openPanel = () => {
    if (options.length === 0) return;
    setActiveIndex(selectedIndex < 0 ? 0 : selectedIndex);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    setOpen(false);
    triggerRef.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  };

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const moveActive = (delta: number) =>
    setActiveIndex((index) => Math.min(Math.max(index + delta, 0), options.length - 1));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) {
          openPanel();
        } else if (event.key === "ArrowDown") {
          moveActive(1);
        } else if (event.key === "ArrowUp") {
          moveActive(-1);
        } else {
          commit(activeIndex);
        }
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        if (open) setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && options.length > 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={handleKeyDown}
        className={cn(triggerVariants({ variant, size }), triggerClassName)}
      >
        {icon ? <span className="shrink-0 text-[var(--nx-faint)]">{icon}</span> : null}
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-[var(--nx-faint)] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute top-[calc(100%+6px)] left-0 z-50 max-h-72 w-max min-w-full max-w-[min(360px,85vw)] overflow-y-auto rounded-xl border border-[var(--nx-border-strong)] bg-[var(--nx-raised)] p-1 shadow-2xl",
            panelClassName,
          )}
        >
          {options.length === 0 ? (
            <p className="px-2.5 py-2 font-mono text-[11px] text-[var(--nx-faint)]">{emptyLabel}</p>
          ) : (
            options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  data-index={index}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
                    isActive
                      ? "bg-[var(--nx-surface)] text-[var(--nx-ink)]"
                      : "text-[var(--nx-muted)]",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="shrink-0 font-mono text-[10px] text-[var(--nx-faint)]">
                      {option.hint}
                    </span>
                  ) : null}
                  <Check
                    size={13}
                    className={cn("shrink-0", isSelected ? "text-[var(--nx-ink)]" : "opacity-0")}
                  />
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
