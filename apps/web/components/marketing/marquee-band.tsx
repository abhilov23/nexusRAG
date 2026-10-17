"use client";

const ITEMS = [
  "Tree-sitter parsing",
  "Code-aware chunking",
  "Hybrid retrieval",
  "Vector search",
  "Lexical search",
  "Code graph",
  "Reranking",
  "Grounded answers",
];

export function MarqueeBand() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <section aria-label="Capabilities" className="relative z-10 -my-2 overflow-hidden py-6">
      <div className="-rotate-[1.2deg] scale-[1.02] border-y border-[var(--nx-border-strong)] bg-[var(--nx-ink)] text-[var(--nx-bg)]">
        <div className="nx2-marquee-track items-center gap-0 py-3">
          {row.map((item, i) => (
            <span
              key={`${item}-${i}`}
              aria-hidden={i >= ITEMS.length}
              className="flex shrink-0 items-center gap-6 pr-6 nx2-mono text-[12.5px] font-medium tracking-[0.18em] whitespace-nowrap uppercase"
            >
              {item}
              <span aria-hidden="true" className="text-[10px] opacity-60">
                ◆
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
