import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison.
 *
 * Node's `timingSafeEqual` throws on length mismatch, so length is compared
 * first. That is fine here: both operands are fixed-length random tokens, so
 * the length itself is not a secret.
 *
 * Imported from `node:crypto` rather than the global, because the global
 * `crypto` is WebCrypto, which has no timingSafeEqual.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return nodeTimingSafeEqual(bufferA, bufferB);
}
