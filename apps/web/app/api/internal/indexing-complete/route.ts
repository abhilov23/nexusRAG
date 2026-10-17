import { NextResponse } from "next/server";
import { db } from "@repo/database";
import { timingSafeEqual } from "@/lib/auth/security/timing-safe";
import { readJsonBody } from "@/lib/security/body";

export const dynamic = "force-dynamic";

/**
 * Internal completion callback for the Python indexing consumer.
 *
 * Authenticated by a shared bearer secret (never by session cookie -- the
 * consumer has no browser session). CSRF origin checks are skipped for the
 * same reason; the 256-bit secret is the entire auth story here.
 *
 * The update is conditional on the row still expecting this commit, so a slow
 * retry cannot overwrite a newer attempt's verdict.
 */
type CallbackBody = {
  repositoryId?: unknown;
  commitSha?: unknown;
  ok?: unknown;
  language?: unknown;
  error?: unknown;
};

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_API_KEY;
  if (!secret) {
    return NextResponse.json({ message: "Indexing callback is not configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || !timingSafeEqual(token, secret)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const parsed = await readJsonBody(request, 16_384);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { repositoryId, commitSha, ok, language, error: jobError } = parsed.value as CallbackBody;
  if (
    typeof repositoryId !== "string" ||
    !repositoryId ||
    typeof commitSha !== "string" ||
    !commitSha
  ) {
    return NextResponse.json(
      { message: "repositoryId and commitSha are required" },
      { status: 400 },
    );
  }

  const cleanLanguage =
    typeof language === "string" && language.length > 0 && language.length <= 32 ? language : null;
  const cleanError =
    typeof jobError === "string" && jobError.length > 0
      ? jobError.slice(0, 2000)
      : "Indexing failed";

  const updated = await db.repository.updateMany({
    where: { id: repositoryId, commitSha, status: "INDEXING" },
    data:
      ok === true
        ? {
            status: "READY",
            language: cleanLanguage,
            lastIngestedAt: new Date(),
            errorMessage: null,
          }
        : { status: "FAILED", errorMessage: cleanError },
  });

  if (updated.count === 0) {
    return NextResponse.json({ message: "No matching in-flight repository" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
