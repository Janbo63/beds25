import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionFromCookieHeader } from '@/lib/auth';

/**
 * Middleware — Cookie-based session authentication
 * 
 * Replaces the previous HTTP Basic Auth with secure JWT cookie sessions.
 * 
 * Public routes (no auth required):
 *   /api/public/*     — Booking widget, availability, rooms
 *   /api/webhooks/*   — Stripe, Beds24 webhooks
 *   /api/cron/*       — Vercel cron jobs (use CRON_SECRET)
 *   /login            — Login page itself
 *   /api/auth/*       — Auth endpoints
 * 
 * Protected routes (session cookie required):
 *   /dashboard/*      — Admin dashboard
 *   /api/admin/*      — Admin API endpoints
 *   Everything else   — Protected by default
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // ── Public routes — no auth needed ──
    if (
        pathname.startsWith('/api/public') ||
        pathname.startsWith('/api/webhooks') ||
        pathname.startsWith('/api/cron') ||
        pathname.startsWith('/api/auth') ||
        pathname === '/login'
    ) {
        return NextResponse.next();
    }

    // ── Check session cookie ──
    const cookieHeader = request.headers.get('cookie');
    const session = await verifySessionFromCookieHeader(cookieHeader);

    if (session) {
        // Valid session — allow through
        return NextResponse.next();
    }

    // ── No valid session — redirect to login ──
    // For API routes, return 401 JSON
    if (pathname.startsWith('/api/')) {
        return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
        );
    }

    // For pages, redirect to login with return URL
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    // Run on pages and API routes — skip Next.js internals and static files
    matcher: ['/((?!_next|.*\\..*).*)', '/api/:path*'],
};
