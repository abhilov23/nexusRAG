/** Display formatting shared by the ingestion surfaces. */

/** Compact relative time, e.g. "just now", "12 min ago", "3 days ago". */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const time = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(time.getTime())) return "—";

  const seconds = Math.round((Date.now() - time.getTime()) / 1000);

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} sec ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;

  return `${Math.round(months / 12)} yr ago`;
}

/** Binary-friendly size label. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Short sha for dense table cells. */
export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "—";
}
