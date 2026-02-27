import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Minimal middleware — locale detection is handled by src/i18n/request.ts.
 * The next-intl createMiddleware was removed because localePrefix: 'never'
 * makes it effectively a no-op, and it caused webServer startup timeouts
 * in CI (Playwright).
 */
export function middleware(request: NextRequest) {
    const url = request.nextUrl;

    // Explicitly allow public APIs and webhooks to bypass authentication
    if (url.pathname.startsWith('/api/public') || url.pathname.startsWith('/api/webhooks')) {
        return NextResponse.next();
    }

    // Require HTTP Basic Auth for all other routes
    const basicAuth = request.headers.get('authorization');

    if (basicAuth) {
        const authValue = basicAuth.split(' ')[1];
        const [user, pwd] = atob(authValue).split(':');

        const validUser = process.env.ADMIN_USERNAME || 'admin';
        const validPass = process.env.ADMIN_PASSWORD || 'alpaca2026';

        if (user === validUser && pwd === validPass) {
            return NextResponse.next();
        }
    }

    // Prompt for authentication
    return new NextResponse('Authentication required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Beds25 Secure Area"',
        },
    });
}

export const config = {
    // Run on pages and API routes — skip Next.js internals and static files
    matcher: ['/((?!_next|.*\\..*).*)']
};
