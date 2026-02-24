import { NextRequest, NextResponse } from 'next/server';

const ALPACA_ORIGIN = 'https://zagrodaalpakoterapii.com';
const ALLOWED_ORIGINS = [ALPACA_ORIGIN, 'http://localhost:3000', 'http://localhost:3001'];

/**
 * Validate the Bearer token and return CORS headers.
 * Returns a 401 NextResponse if unauthorised, null if OK.
 */
export function validateAlpacaAuth(request: NextRequest): NextResponse | null {
    const authHeader = request.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const validKey = process.env.ALPACA_SITE_API_KEY;

    if (!validKey) {
        console.error('[AlpacaAuth] ALPACA_SITE_API_KEY env var not set');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    if (!token || token !== validKey) {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401, headers: corsHeaders(request) });
    }

    return null; // OK
}

export function corsHeaders(request: NextRequest): Record<string, string> {
    const origin = request.headers.get('origin') ?? '';
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALPACA_ORIGIN;
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
}

/** Handle preflight OPTIONS requests — place at top of every route */
export function handleCorsOptions(request: NextRequest): NextResponse {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
