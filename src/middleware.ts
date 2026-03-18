import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/login";
  const isAuthApi = pathname.startsWith("/api/auth");

  // ── Public routes — no auth needed ──
  const isPublicRoute =
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron");

  if (isAuthApi || isPublicRoute) return NextResponse.next();

  // Redirect unauthenticated users
  if (!isLoggedIn && !isLoginPage) {
    // For API routes, return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    // For pages, redirect to login with return URL
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Run on pages and API routes — skip Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/api/:path*"],
};
