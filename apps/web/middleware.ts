import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/", "/login", "/signup", "/api/auth"];
const publicPrefixes = ["/api/auth", "/_next", "/favicon.ico", "/public"];

function isPublicPath(pathname: string) {
  if (publicPaths.includes(pathname)) return true;
  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionId = request.cookies.get("session")?.value;

  if (!sessionId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Skip session validation in middleware for now - let the page handle it
  // This avoids Redis connection issues in edge runtime
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-id", sessionId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|public|login|signup).*)",
  ],
};