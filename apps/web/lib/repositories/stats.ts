"use client";

import { useEffect, useState } from "react";

import { listRepositories, type Repository } from "@/lib/repositories/client";

export type RepositoryStats = {
  total: number;
  ready: number;
  active: number;
  failed: number;
  /** Total stored archive size across ready repositories, in bytes. */
  storedBytes: number;
  loading: boolean;
};

const EMPTY: RepositoryStats = {
  total: 0,
  ready: 0,
  active: 0,
  failed: 0,
  storedBytes: 0,
  loading: true,
};

/**
 * Repository counts from the API, shared by the sidebar usage card and the
 * workspace stats.
 */
export function useRepositoryStats(refreshKey?: unknown): RepositoryStats & { rows: Repository[] } {
  const [stats, setStats] = useState<RepositoryStats>(EMPTY);
  const [rows, setRows] = useState<Repository[]>([]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    void listRepositories(controller.signal)
      .then((repositories) => {
        if (!active) return;
        setRows(repositories);
        setStats({
          total: repositories.length,
          ready: repositories.filter((r) => r.status === "READY").length,
          active: repositories.filter(
            (r) => r.status === "QUEUED" || r.status === "DOWNLOADING" || r.status === "UPLOADING",
          ).length,
          failed: repositories.filter((r) => r.status === "FAILED").length,
          storedBytes: repositories.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0),
          loading: false,
        });
      })
      .catch(() => {
        if (active) setStats({ ...EMPTY, loading: false });
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [refreshKey]);

  return { ...stats, rows };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
