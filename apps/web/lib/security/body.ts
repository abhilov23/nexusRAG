/**
 * Bounded JSON body parsing.
 *
 * `await request.json()` will happily buffer whatever it is handed. On an
 * unauthenticated endpoint that is free memory pressure, so the size is checked
 * before the body is read and the failure is reported as 413 rather than a
 * generic 400.
 */

import { NextResponse } from "next/server";

/** Generous enough for any real payload here, small enough to bound memory. */
export const MAX_BODY_BYTES = 64 * 1024;

export type JsonBody = { ok: true; value: unknown } | { ok: false; response: NextResponse };

export async function readJsonBody(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<JsonBody> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json({ message: "Payload too large" }, { status: 413 }),
      };
    }
  }

  const text = await request.text();

  // Content-Length is advisory and frequently absent (chunked uploads), so the
  // real length is always measured too.
  if (text.length > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Payload too large" }, { status: 413 }),
    };
  }

  if (text.length === 0) {
    return { ok: false, response: NextResponse.json({ message: "Empty body" }, { status: 400 }) };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ message: "Malformed JSON" }, { status: 400 }),
    };
  }
}
