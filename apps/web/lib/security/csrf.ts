/**
 * CSRF protection for cookie-authenticated requests.
 *
 * The session cookie is `SameSite=Lax`, which already blocks cross-site POSTs
 * from carrying credentials. That is a real mitigation but it is a single
 * browser-level control, and it does nothing against a same-site attacker or a
 * browser that mishandles SameSite.
 *
 * So every state-changing request is *additionally* required to be same-origin,
 * checked here. Origin is checked first because browsers send it on all
 * cross-origin writes; Referer and Sec-Fetch-Site are used as fallbacks for the
 * cases where Origin is absent.
 */

import { NextResponse } from "next/server";

/** Methods that cannot change state and therefore need no CSRF check. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The minimum a check needs.
 *
 * Structurally typed rather than taking `Request` so it can be unit tested: the
 * fetch spec forbids scripts from *setting* Origin, Referer and Sec-Fetch-*
 * headers on a real `Request`, so an integration-style test could never
 * exercise the rejection paths.
 */
export type CsrfCheckable = {
  method: string;
  headers: { get(name: string): string | null };
};

export type CsrfFailure = { ok: false; reason: string };

function originAllowed(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Returns null when the request is safe or legitimately same-origin, otherwise a
 * short reason. The reason is safe to return to the caller: it describes the
 * request shape, never its contents.
 */
export function checkCsrf(request: CsrfCheckable): string | null {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return null;
  }

  const host = request.headers.get("host");

  const origin = request.headers.get("origin");
  if (origin) {
    return originAllowed(origin, host)
      ? null
      : "Cross-origin request blocked: unexpected Origin header";
  }

  // Sec-Fetch-Site is sent by every current browser on fetch/XHR. When it is
  // present it is authoritative; absence means a non-browser client.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite === "same-origin" || fetchSite === "none"
      ? null
      : `Cross-origin request blocked: Sec-Fetch-Site is ${fetchSite}`;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    return originAllowed(referer, host)
      ? null
      : "Cross-origin request blocked: unexpected Referer header";
  }

  // No Origin, no Sec-Fetch-Site and no Referer. Either a same-origin form post
  // from an old client or a forged request from a script that stripped them.
  // Refuse: legitimate first-party writes from our own client code always carry
  // at least one of these headers.
  return "Cross-origin request blocked: no Origin, Referer or Sec-Fetch-Site header";
}

/** Convenience wrapper returning a 403 response when the check fails. */
export function rejectCrossOrigin(request: CsrfCheckable): NextResponse | null {
  const reason = checkCsrf(request);
  if (!reason) return null;
  return NextResponse.json({ message: "Forbidden", reason }, { status: 403 });
}
