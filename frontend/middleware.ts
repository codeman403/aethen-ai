import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that don't require authentication
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/demo-agent",
]);

const PUBLIC_PREFIXES = ["/auth/", "/_next/", "/favicon", "/api/cron"];

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const LAST_ACTIVITY_COOKIE = "aethen_last_activity";

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) =>
    response.headers.set(key, value)
  );
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always refresh session (keeps Supabase cookies alive)
  const { supabaseResponse, user } = await updateSession(request);

  // Apply security headers to all responses
  applySecurityHeaders(supabaseResponse);

  // Public routes — no further checks needed
  if (isPublicPath(pathname)) {
    // Redirect authenticated users away from /login back to dashboard
    if (pathname === "/login" && user) {
      return NextResponse.redirect(new URL("/overview", request.url));
    }
    // Clear any stale activity cookie so OAuth redirects never trigger
    // a false "session expired" on the first protected-route visit after login
    supabaseResponse.cookies.delete(LAST_ACTIVITY_COOKIE);
    return supabaseResponse;
  }

  // Protected route — must be authenticated
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Inactivity timeout check
  const lastActivity = request.cookies.get(LAST_ACTIVITY_COOKIE)?.value;
  const now = Date.now();

  if (lastActivity) {
    const ts = parseInt(lastActivity, 10);
    const elapsed = now - ts;
    // Only fire if the timestamp is a valid past value (guards against stale/malformed cookies)
    if (ts > 0 && ts < now && elapsed > INACTIVITY_TIMEOUT_MS) {
      // Session has been idle too long — sign out and redirect
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("expired", "1");
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(LAST_ACTIVITY_COOKIE);
      applySecurityHeaders(response);
      return response;
    }
  }

  // Update last activity timestamp
  supabaseResponse.cookies.set(LAST_ACTIVITY_COOKIE, String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24, // 24h — cleaned up by inactivity logic
  });

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and image assets.
     * This ensures every request goes through session refresh.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
