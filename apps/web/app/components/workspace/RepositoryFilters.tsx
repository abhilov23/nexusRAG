"use client";

import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";

interface RepositoryFiltersProps {
  filter: string;
  onFilterChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  count: number;
}

export function RepositoryFilters({
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  count,
}: RepositoryFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor="repo-search"
        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 text-[var(--nx-muted)] transition-colors focus-within:border-[var(--nx-signal)] sm:max-w-[260px]"
      >
        <Search size={15} className="shrink-0" />
        <input
          id="repo-search"
          type="text"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Filter by name or language"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
        />
        {filter ? (
          <button
            type="button"
            onClick={() => onFilterChange("")}
            aria-label="Clear filter"
            className="rounded-md px-1.5 py-0.5 font-mono text-[11px] text-[var(--nx-faint)] hover:text-[var(--nx-ink)]"
          >
            ✕
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-[var(--nx-border)] bg-[var(--nx-raised)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--nx-faint)] sm:block">
            /
          </kbd>
        )}
      </label>
      <Select
        ariaLabel="Sort repositories"
        value={sortBy}
        onChange={onSortChange}
        options={[
          { value: "recent", label: "Recently added" },
          { value: "name", label: "Name A–Z" },
          { value: "status", label: "Needs attention first" },
        ]}
        className="shrink-0"
        panelClassName="left-auto right-0"
      />
      <span
        className="rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-2 py-1.5 font-mono text-[11px] tabular-nums text-[var(--nx-muted)]"
        aria-label={`${count} repositories shown`}
      >
        {count}
      </span>
    </div>
  );
}
