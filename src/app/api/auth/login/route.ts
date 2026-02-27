import { NextResponse } from 'next/server';
import { validatePin, createSessionToken, setSessionCookie } from '@/lib/auth';

/**
 * POST /api/auth/login
 * Validates the admin PIN and sets a secure session cookie.
 */
export async function POST(request: Request) {
    try {
        const { pin } = await request.json();

        if (!pin || typeof pin !== 'string') {
            return NextResponse.json(
                { error: 'PIN is required' },
                { status: 400 }
            );
        }

        if (!validatePin(pin)) {
            // Small delay to slow down brute force
            await new Promise(resolve => setTimeout(resolve, 1000));
            return NextResponse.json(
                { error: 'Invalid PIN' },
                { status: 401 }
            );
        }

        // Create JWT and set cookie
        const token = await createSessionToken();
        await setSessionCookie(token);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        return NextResponse.json(
            { error: 'Login failed' },
            { status: 500 }
        );
    }
}
