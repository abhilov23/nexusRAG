import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { securityHeaders } from "@/lib/security/headers";

/** Pages reachable without a session cookie. */
const publicPaths = ["/", "/login", "/reset-password", "/api/auth", "/api/status"];
const publicPrefixes = ["/api/auth", "/_next", "/favicon.ico", "/public"];

function isPublicPath(pathname: string) {
  if (publicPaths.includes(pathname)) return true;
  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const applyHeaders = (response: NextResponse) => {
    for (const [key, value] of Object.entries(
      securityHeaders(process.env.NODE_ENV === "production"),
    )) {
      response.headers.set(key, value);
    }
    return response;
  };

  if (isPublicPath(pathname)) {
    // Even public routes get the security headers.
    return applyHeaders(NextResponse.next());
  }

  // Machine-to-machine callbacks (indexing worker completion) carry no
  // session cookie by design. They authenticate inside the route with a
  // 256-bit bearer secret, so the session gate must not reject them first --
  // otherwise every callback 401s here and indexed repositories sit in
  // INDEXING forever.
  if (pathname.startsWith("/api/internal/")) {
    return applyHeaders(NextResponse.next());
  }

  const sessionId = request.cookies.get("session")?.value;

  if (!sessionId) {
    // An unauthenticated API caller needs a JSON error, not an HTML login page.
    // Redirecting an XHR into login markup produces a confusing parse failure.
    if (pathname.startsWith("/api/")) {
      return applyHeaders(NextResponse.json({ message: "Not authenticated" }, { status: 401 }));
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return applyHeaders(NextResponse.redirect(loginUrl));
  }

  // Skip session validation in middleware for now - let the page handle it
  // This avoids Redis connection issues in edge runtime
  return applyHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // Everything, including /api/auth, so security headers apply uniformly.
    // Auth is still enforced per-route rather than here.
    //
    // Static assets served from public/ live at the URL root (/images/...),
    // not under a /public prefix, so file extensions are excluded explicitly.
    // Without this, image and font requests are redirected to /login and the
    // browser renders alt text instead of the asset.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|jpg|jpeg|png|svg|ico|woff2?|ttf|otf|avif|gif|mp4|webm|txt|xml|json|map)$|public).*)",
  ],
};
