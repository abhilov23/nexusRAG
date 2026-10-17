/**
 * Security response headers.
 *
 * Applied in middleware so they cover every path, including /api/auth which the
 * middleware matcher otherwise skips.
 */

/**
 * Content-Security-Policy.
 *
 * Notes on the two allowances that look unusual:
 *
 * - `style-src 'unsafe-inline'` is required because React sets inline styles for
 *   dynamic values (graph node positions, progress widths). Removing it would
 *   break the graph and progress bars.
 * - The theme bootstrap in `app/layout.tsx` is an inline script and must run
 *   before paint, so it cannot be moved to an external file or given a
 *   per-request nonce. It is allowed via `'unsafe-inline'` in script-src rather
 *   than a hash, because a hash would need recomputing whenever that snippet
 *   changes and would fail closed on any drift.
 *
 * frame-ancestors covers clickjacking; X-Frame-Options is set as a fallback for
 * older browsers.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export function securityHeaders(isProduction: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  };

  // `X-Powered-By` is disabled via `poweredByHeader: false` in next.config.js.
  // It cannot be removed from here: Next appends it after middleware runs.

  if (isProduction) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}
