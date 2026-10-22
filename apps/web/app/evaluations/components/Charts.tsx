"use client";

import type { OverviewBucket } from "@/lib/evaluations/types";
import { formatCount, formatLatency } from "@/lib/evaluations/format";

const WIDTH = 600;
const HEIGHT = 150;
const PLOT_HEIGHT = 124;
const TOP = 10;

type Series = {
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
};

function Grid() {
  return (
    <>
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <line
          key={fraction}
          x1={0}
          x2={WIDTH}
          y1={TOP + PLOT_HEIGHT * fraction}
          y2={TOP + PLOT_HEIGHT * fraction}
          stroke="var(--nx-border)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

function XAxis({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  const positions =
    labels.length === 1
      ? [0]
      : labels.length === 2
        ? [0, 1]
        : [0, Math.floor((labels.length - 1) / 2), labels.length - 1];

  return (
    <div className="mt-2 flex items-center justify-between font-mono text-[9.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
      {positions.map((index, position) => (
        <span key={`${index}-${position}`}>{labels[index]}</span>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase"
        >
          <span
            aria-hidden="true"
            className="h-[2px] w-4 rounded-full"
            style={{
              background: item.dashed
                ? `repeating-linear-gradient(to right, ${item.color} 0 3px, transparent 3px 6px)`
                : item.color,
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function QueriesChart({ buckets, labels }: { buckets: OverviewBucket[]; labels: string[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.queries));
  const gap = buckets.length > 0 ? WIDTH / buckets.length : WIDTH;
  const barWidth = Math.max(3, Math.min(22, gap * 0.56));

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[162px] w-full"
        role="img"
        aria-label="Queries over time"
        preserveAspectRatio="none"
      >
        <Grid />
        {buckets.map((bucket, index) => {
          const success = Math.max(0, bucket.queries - bucket.errors);
          const totalHeight =
            bucket.queries > 0 ? Math.max(2, (bucket.queries / max) * PLOT_HEIGHT) : 0;
          const errorHeight =
            bucket.errors > 0 ? Math.max(2, (bucket.errors / max) * PLOT_HEIGHT) : 0;
          const successHeight = Math.max(0, totalHeight - errorHeight);
          const x = index * gap + (gap - barWidth) / 2;
          const baseY = TOP + PLOT_HEIGHT;
          const tooltip = `${labels[index] ?? ""}: ${bucket.queries} queries${
            bucket.errors > 0 ? `, ${bucket.errors} errors` : ""
          }`;

          return (
            <g key={bucket.start}>
              {successHeight > 0 ? (
                <rect
                  x={x}
                  y={baseY - successHeight}
                  width={barWidth}
                  height={successHeight}
                  rx={2}
                  fill="var(--nx-ink)"
                  opacity={0.85}
                >
                  <title>{tooltip}</title>
                </rect>
              ) : null}
              {errorHeight > 0 ? (
                <rect
                  x={x}
                  y={baseY - successHeight - errorHeight}
                  width={barWidth}
                  height={errorHeight}
                  rx={2}
                  fill="var(--nx-bad)"
                  opacity={0.9}
                >
                  <title>{tooltip}</title>
                </rect>
              ) : null}
              {bucket.queries === 0 ? (
                <rect
                  x={x}
                  y={baseY - 2}
                  width={barWidth}
                  height={2}
                  rx={1}
                  fill="var(--nx-border-strong)"
                >
                  <title>{tooltip}</title>
                </rect>
              ) : null}
            </g>
          );
        })}
      </svg>
      <XAxis labels={labels} />
      <Legend
        items={[
          { label: "Succeeded", color: "var(--nx-ink)" },
          { label: "Errors", color: "var(--nx-bad)" },
        ]}
      />
    </div>
  );
}

export function LineChart({
  labels,
  series,
  formatValue = formatCount,
  ariaLabel,
  emptyLabel = "No data in this range",
}: {
  labels: string[];
  series: Series[];
  formatValue?: (value: number) => string;
  ariaLabel: string;
  emptyLabel?: string;
}) {
  const values = series.flatMap((item) =>
    item.values.filter((value): value is number => value !== null && Number.isFinite(value)),
  );
  const max = Math.max(0, ...values);
  const hasData = values.length > 0 && max > 0;
  const step = labels.length > 1 ? WIDTH / (labels.length - 1) : 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[162px] w-full"
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <Grid />
        {series.map((item) => {
          let path = "";
          let started = false;
          const points: { x: number; y: number; value: number }[] = [];

          item.values.forEach((value, index) => {
            if (value === null || !Number.isFinite(value)) {
              started = false;
              return;
            }
            const x = labels.length > 1 ? index * step : WIDTH / 2;
            const y = TOP + PLOT_HEIGHT - (max > 0 ? (value / max) * PLOT_HEIGHT : 0);
            path += `${started ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
            started = true;
            points.push({ x, y, value });
          });

          return (
            <g key={item.label}>
              <path
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={item.dashed ? "4 4" : undefined}
                opacity={item.dashed ? 0.55 : 0.9}
                vectorEffect="non-scaling-stroke"
              />
              {points.map((point, index) => (
                <circle
                  key={`${item.label}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={2.3}
                  fill={item.color}
                  opacity={item.dashed ? 0.55 : 0.95}
                >
                  <title>{`${item.label}: ${formatValue(point.value)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {!hasData ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rounded-full border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 py-1 font-mono text-[10px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
            {emptyLabel}
          </span>
        </div>
      ) : null}
      <XAxis labels={labels} />
      <Legend items={series} />
    </div>
  );
}

export function latencySeries(buckets: OverviewBucket[]): Series[] {
  return [
    {
      label: "Avg",
      color: "var(--nx-ink)",
      values: buckets.map((bucket) => bucket.avgLatencyMs),
    },
    {
      label: "P95",
      color: "var(--nx-muted)",
      values: buckets.map((bucket) => bucket.p95LatencyMs),
      dashed: true,
    },
  ];
}

export function formatLatencyAxis(value: number): string {
  return formatLatency(value);
}
