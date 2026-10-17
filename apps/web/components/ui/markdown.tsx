"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders assistant answers from raw markdown into the design system.
 * Caller-supplied HTML stays escaped (no rehype-raw): LLM output is untrusted.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("nx-markdown", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
