import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

/**
 * POST /api/auth/logout
 * Clears the session cookie and redirects to login.
 */
export async function POST() {
    await clearSessionCookie();
    return NextResponse.json({ success: true });
}
