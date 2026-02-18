import { NextResponse } from 'next/server';

/**
 * CORS headers for public API routes.
 * Allows the Alpaca website (zagrodaalpakoterapii.com) to call Beds25 APIs.
 */
const ALLOWED_ORIGINS = [
    'https://zagrodaalpakoterapii.com',
    'https://www.zagrodaalpakoterapii.com',
    'http://localhost:3000', // Local dev
    'http://localhost:3001',
];

export function corsHeaders(request: Request): HeadersInit {
    const origin = request.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

export function withCors(response: NextResponse, request: Request): NextResponse {
    const headers = corsHeaders(request);
    Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
    });
    return response;
}

export function corsOptionsResponse(request: Request): NextResponse {
    return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(request),
    });
}
