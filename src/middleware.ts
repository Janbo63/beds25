import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Minimal middleware — locale detection is handled by src/i18n/request.ts.
 * The next-intl createMiddleware was removed because localePrefix: 'never'
 * makes it effectively a no-op, and it caused webServer startup timeouts
 * in CI (Playwright).
 */
export function middleware(request: NextRequest) {
    return NextResponse.next();
}

export const config = {
    // Only run on page routes — skip API, static files, and Next.js internals
    matcher: ['/((?!api|_next|.*\\..*).*)']
};
