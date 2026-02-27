import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

/**
 * Admin Authentication Utility
 * 
 * Replaces HTTP Basic Auth with secure cookie-based sessions.
 * Uses a 6-digit PIN for login, stored as ADMIN_PIN env var.
 * Sessions last 30 days via HttpOnly JWT cookie.
 */

const COOKIE_NAME = 'beds25_session';
const SESSION_DURATION_DAYS = 30;

function getJwtSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || 'beds25-fallback-change-me';
    return new TextEncoder().encode(secret);
}

/** Validate the PIN against the env var */
export function validatePin(pin: string): boolean {
    const validPin = process.env.ADMIN_PIN || '000000';
    return pin === validPin;
}

/** Create a signed JWT session token */
export async function createSessionToken(): Promise<string> {
    const secret = getJwtSecret();
    const token = await new SignJWT({
        role: 'admin',
        loginAt: new Date().toISOString(),
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
        .sign(secret);

    return token;
}

/** Verify a JWT session token — returns payload or null */
export async function verifySessionToken(token: string) {
    try {
        const secret = getJwtSecret();
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch {
        return null;
    }
}

/** Set the session cookie after successful login */
export async function setSessionCookie(token: string) {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
        path: '/',
    });
}

/** Clear the session cookie on logout */
export async function clearSessionCookie() {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
}

/** Get session from cookie — for use in server components/API routes */
export async function getSession() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);

    if (!sessionCookie?.value) return null;

    return verifySessionToken(sessionCookie.value);
}

/** 
 * Check session from a raw cookie header string
 * Used in middleware (can't use next/headers cookies() there the same way)
 */
export async function verifySessionFromCookieHeader(cookieHeader: string | null) {
    if (!cookieHeader) return null;

    const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (!match) return null;

    return verifySessionToken(match[1]);
}
