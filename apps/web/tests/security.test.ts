/**
 * Security primitive tests.
 *
 * These are pure-function tests: no Redis, no database, no network. The Redis
 * backed helpers (rate limiting, idempotency) are covered separately by
 * test/security.redis.mjs against the live instance.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { checkCsrf, type CsrfCheckable } from "../lib/security/csrf.js";
import { MAX_BODY_BYTES } from "../lib/security/body.js";
import { parseIdempotencyKey } from "../lib/security/idempotency.js";
import { clientIdentifier, RATE_LIMITS } from "../lib/security/rate-limit.js";
import { CONTENT_SECURITY_POLICY, securityHeaders } from "../lib/security/headers.js";
import { isValidEmail, safeRedirectPath, validatePassword } from "../lib/auth/validation.js";
import { timingSafeEqual } from "../lib/auth/security/timing-safe.js";

const HOST = "localhost:3000";

/**
 * Plain objects, not real `Request`s: the fetch spec treats Origin, Referer and
 * Sec-Fetch-* as forbidden header names, so a script cannot set them on a
 * `Request` and the rejection paths would be untestable.
 */
function req(init: { method?: string } & Record<string, string | undefined>): CsrfCheckable {
  const { method = "POST", ...headers } = init;
  const lower = new Map(
    Object.entries(headers)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { method, headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null } };
}

const sameOrigin = { host: HOST, origin: `https://${HOST}` };

// --- CSRF ------------------------------------------------------------------

test("safe methods never require an origin", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(checkCsrf(req({ method })), null, method);
  }
});

test("same-origin writes pass", () => {
  assert.equal(checkCsrf(req({ method: "POST", ...sameOrigin })), null);
  assert.equal(checkCsrf(req({ method: "PUT", ...sameOrigin })), null);
  assert.equal(checkCsrf(req({ method: "DELETE", ...sameOrigin })), null);
  assert.equal(checkCsrf(req({ method: "PATCH", ...sameOrigin })), null);
});

test("cross-origin writes are rejected", () => {
  const bad = checkCsrf(req({ method: "POST", host: HOST, origin: "https://evil.example" }));
  assert.ok(bad, "expected rejection");
  assert.match(bad, /Origin/);
});

test("a protocol-relative or port-mismatched origin is rejected", () => {
  assert.ok(checkCsrf(req({ method: "POST", host: HOST, origin: `https://${HOST}.evil.com` })));
  assert.ok(checkCsrf(req({ method: "POST", host: HOST, origin: "https://localhost:9999" })));
  assert.ok(checkCsrf(req({ method: "POST", host: HOST, origin: "null" })));
});

test("Sec-Fetch-Site is honoured when Origin is absent", () => {
  assert.equal(
    checkCsrf(req({ method: "POST", host: HOST, "sec-fetch-site": "same-origin" })),
    null,
  );
  const crossSite = checkCsrf(req({ method: "POST", host: HOST, "sec-fetch-site": "cross-site" }));
  assert.ok(crossSite);
  assert.match(crossSite, /Sec-Fetch-Site/);
});

test("Referer is used as a fallback", () => {
  assert.equal(
    checkCsrf(req({ method: "POST", host: HOST, referer: `https://${HOST}/sync` })),
    null,
  );
  assert.ok(checkCsrf(req({ method: "POST", host: HOST, referer: "https://evil.example/x" })));
});

test("a request with no origin signals at all is rejected", () => {
  const reason = checkCsrf(req({ method: "POST", host: HOST }));
  assert.ok(reason, "expected rejection");
  assert.match(reason, /no Origin/);
});

// --- body limits -----------------------------------------------------------

test("the declared body ceiling is sane", () => {
  assert.ok(MAX_BODY_BYTES > 0 && MAX_BODY_BYTES <= 1024 * 1024);
});

// --- idempotency key shape -------------------------------------------------

test("Idempotency-Key must be 16-128 printable non-space characters", () => {
  const withKey = (value: string) =>
    parseIdempotencyKey({
      headers: { get: (n: string) => (n.toLowerCase() === "idempotency-key" ? value : null) },
    });

  assert.equal(withKey("a".repeat(16))?.length, 16);
  assert.equal(withKey("a".repeat(128))?.length, 128);

  assert.equal(withKey("a".repeat(15)), null);
  assert.equal(withKey("a".repeat(129)), null);
  assert.equal(withKey("has spaces here"), null);
  assert.equal(withKey("line\nbreak"), null);
  assert.equal(parseIdempotencyKey({ headers: { get: () => null } }), null);
});

test("surrounding whitespace is tolerated", () => {
  const withKey = (value: string) => parseIdempotencyKey({ headers: { get: () => value } });
  assert.equal(withKey("  abcdefghijklmnop  "), "abcdefghijklmnop");
});

// --- client identity -------------------------------------------------------

test("the first X-Forwarded-For entry is the client", () => {
  const r = req({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" });
  assert.equal(clientIdentifier(r as never), "203.0.113.5");
});

test("identity falls back without a forwarding header", () => {
  assert.equal(clientIdentifier(req({}) as never), "unknown");
  assert.equal(clientIdentifier(req({ "x-real-ip": "198.51.100.7" }) as never), "198.51.100.7");
});

// --- rate limit policy -----------------------------------------------------

test("rate limits are plausible and every limit is positive", () => {
  for (const [name, rule] of Object.entries(RATE_LIMITS)) {
    assert.ok(rule.limit > 0, `${name}.limit`);
    assert.ok(rule.windowSeconds > 0, `${name}.windowSeconds`);
  }
  // Credential endpoints must be tighter than the read-only ones.
  assert.ok(RATE_LIMITS.login.limit < RATE_LIMITS.readQueue.limit);
  assert.ok(RATE_LIMITS.forgetPassword.limit <= 3);
});

// --- headers ---------------------------------------------------------------

test("security headers cover the expected baseline", () => {
  const headers = securityHeaders(true);

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.ok(headers["Referrer-Policy"]);
  assert.ok(headers["Permissions-Policy"]);
  assert.ok(headers["Strict-Transport-Security"], "HSTS should be set in production");

  // X-Powered-By is deliberately absent here. Next appends it *after*
  // middleware runs, so it cannot be removed from middleware and is instead
  // disabled with `poweredByHeader: false` in next.config.js.
  assert.equal("X-Powered-By" in headers, false);
});

test("HSTS is omitted outside production", () => {
  assert.equal(securityHeaders(false)["Strict-Transport-Security"], undefined);
});

test("CSP blocks framing and objects but permits the app's own assets", () => {
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /base-uri 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /form-action 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /fonts\.googleapis\.com/);
});

// --- validation ------------------------------------------------------------

test("email validation rejects obvious junk", () => {
  assert.ok(isValidEmail("a@b.co"));
  assert.ok(!isValidEmail("no-at-sign"));
  assert.ok(!isValidEmail("two@@ats.com"));
  assert.ok(!isValidEmail("spaces in@email.com"));
  assert.ok(!isValidEmail(`${"a".repeat(250)}@b.com`));
});

test("password policy requires length and some variety", () => {
  assert.equal(validatePassword("short1A"), "Password must be at least 8 characters");
  assert.ok(validatePassword("alllowercase"));
  assert.ok(validatePassword("ALLUPPERCASE"));
  assert.ok(validatePassword("1234567890"));
  assert.equal(validatePassword("correcthorse1"), null);
  assert.equal(validatePassword("passphrase-only-ok"), null);
  assert.ok(validatePassword(`Aa1${"x".repeat(300)}`), "must be bounded");
});

test("open redirects are refused", () => {
  assert.equal(safeRedirectPath("/sync"), "/sync");
  assert.equal(safeRedirectPath("/workspace?tab=1"), "/workspace?tab=1");

  assert.equal(safeRedirectPath("//evil.com"), null);
  assert.equal(safeRedirectPath("https://evil.com"), null);
  assert.equal(safeRedirectPath("http://evil.com"), null);
  assert.equal(safeRedirectPath("javascript:alert(1)"), null);
  assert.equal(safeRedirectPath("/\\evil.com"), null);
  assert.equal(safeRedirectPath("/path\nSet-Cookie: x=1"), null);
  assert.equal(safeRedirectPath("sync"), null);
  assert.equal(safeRedirectPath(null), null);
  assert.equal(safeRedirectPath(""), null);
});

// --- timing-safe -----------------------------------------------------------

test("timing-safe comparison matches only identical strings", () => {
  assert.ok(timingSafeEqual("abc123", "abc123"));
  assert.ok(!timingSafeEqual("abc123", "abc124"));
  assert.ok(!timingSafeEqual("abc123", "abc1234"), "length mismatch must not throw");
  assert.ok(!timingSafeEqual("", "x"));
  assert.ok(timingSafeEqual("", ""));
});
