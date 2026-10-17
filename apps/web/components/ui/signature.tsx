"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Word-by-word masked reveal for display headlines.
 *
 * Each word slides up from behind an overflow mask with a stagger — the
 * signature hero motion. Respects reduced motion by rendering statically.
 */
export function SplitReveal({
  text,
  className,
  highlightClassName,
  highlightWords = [],
  delay = 0,
  stagger = 0.055,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  highlightClassName?: string;
  highlightWords?: string[];
  delay?: number;
  stagger?: number;
  as?: "span" | "h1" | "h2" | "p";
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const hot = new Set(highlightWords.map((w) => w.toLowerCase().replace(/[.]$/, "")));

  if (reduce) {
    return React.createElement(Tag, { className }, text);
  }

  return React.createElement(
    Tag,
    { className: cn("inline", className), "aria-label": text },
    words.map((word, i) => {
      const lit = hot.has(word.toLowerCase().replace(/[.]$/, ""));
      return (
        <span
          key={`${word}-${i}`}
          aria-hidden="true"
          className="inline-block overflow-hidden pb-[0.08em] -mb-[0.08em] align-bottom"
        >
          <motion.span
            className={cn("inline-block will-change-transform", lit && highlightClassName)}
            initial={{ y: "110%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.85, delay: delay + i * stagger, ease: [0.21, 0.65, 0.25, 1] }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? <span>&nbsp;</span> : null}
        </span>
      );
    }),
  );
}

/**
 * Spotlight card: a cursor-tracking radial highlight that follows the pointer
 * across the card surface. Borders brighten toward the cursor.
 */
export function SpotlightCard({
  children,
  className,
  spotlight = "rgba(232,93,47,0.14)",
}: {
  children: React.ReactNode;
  className?: string;
  spotlight?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || reduce) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    el.style.setProperty("--spot-o", "1");
  };
  const onLeave = () => {
    ref.current?.style.setProperty("--spot-o", "0");
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn("group/spot relative overflow-hidden", className)}
      style={{ ["--spot-o" as string]: 0 }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[var(--spot-o,0)] transition-opacity duration-500"
        style={{
          background: `radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${spotlight}, transparent 65%)`,
        }}
      />
      {children}
    </div>
  );
}
