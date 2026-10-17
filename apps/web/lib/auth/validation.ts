/**
 * Shared input validation.
 *
 * These rules are enforced on the server. The client applies the same checks for
 * immediate feedback, but client-side validation is a convenience, never a
 * control -- anything can be posted directly to the API.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed);
}

/**
 * Returns a human-readable problem, or null when the password is acceptable.
 *
 * Deliberately modest: length plus a character-class mix. NIST guidance is
 * against composition rules that push people toward `Password1!`, so this does
 * not force a specific class, only that more than one is present.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  // Bounded so a multi-megabyte password cannot be hashed on every attempt.
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }

  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;

  if (classes < 2) {
    return "Password must mix letters, numbers or symbols";
  }

  return null;
}

/**
 * Constrains a `?redirect=` target to a path on this origin.
 *
 * Without this, `?redirect=//evil.com` is protocol-relative and sends the user
 * off-site after sign-in; `https://evil.com` is also accepted by `router.push`.
 * Only a single leading slash followed by a non-slash is allowed.
 */
export function safeRedirectPath(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const value = candidate.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  // Control characters can be used to smuggle a second header or confuse a
  // downstream parser.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
