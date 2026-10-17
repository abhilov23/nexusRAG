"use client";

import { useEffect, useState } from "react";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  workspaceName?: string;
};

const EMPTY: CurrentUser = {
  id: "",
  email: "",
  name: null,
};

/**
 * Reads the signed-in user from /api/auth/me so the shell shows real account
 * details instead of placeholders. Fields stay empty while signed out.
 *
 * status distinguishes "still checking" from "checked and nobody is home".
 * The latter happens with a stale session cookie (signed out elsewhere,
 * expired, or the session store restarted): the middleware only checks that
 * a cookie exists, so this hook is what notices it is dead.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"loading" | "authenticated" | "anonymous">("loading");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    fetch("/api/auth/me", { credentials: "same-origin", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: CurrentUser; preferences?: { workspaceName?: string } } | null) => {
        if (!active) return;
        if (!data?.user) {
          setStatus("anonymous");
          return;
        }
        setUser({
          ...data.user,
          workspaceName: data.preferences?.workspaceName,
        });
        setStatus("authenticated");
      })
      .catch(() => {
        /* signed out, offline, or timed out - bounce to login rather than
           hanging the shell in a Guest/loading limbo */
        if (active) setStatus("anonymous");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  return { user, loading, status };
}

/** "Ada Lovelace" -> "AL"; falls back to "?" so the avatar is never blank. */
export function initials(name: string | null | undefined, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  if (!source) return "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
