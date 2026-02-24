import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * T-3 Balance Charge Cron
 * POST /api/cron/charge-balances
 *
 * Runs daily at 08:00 UTC via Vercel cron.
 * Finds all DEPOSIT_PAID bookings where checkIn is exactly 3 days away
 * and attempts to charge the saved payment method for the balance.
 *
 * Beds25 does NOT send emails — Zoho Deal status updates trigger Zoho workflows
 * which handle all guest communication.
 */
export async function POST(request: NextRequest) {
    // Verify this is called by Vercel cron or internal systems
    const secret = request.headers.get('x-cron-secret') ?? request.headers.get('authorization')?.replace('Bearer ', '');
    if (!CRON_SECRET || secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + 3);
    const targetDateEnd = new Date(targetDate);
    targetDateEnd.setDate(targetDateEnd.getDate() + 1);

    // Find all bookings due for balance charge today (checkIn = today + 3)
    const bookings = await prisma.booking.findMany({
        where: {
            status: 'DEPOSIT_PAID',
            checkIn: { gte: targetDate, lt: targetDateEnd },
            balancePaidAt: null,
            stripeCustomerId: { not: null },
            stripePaymentMethodId: { not: null },
            balanceAmount: { not: null, gt: 0 },
        },
        include: { room: { select: { name: true } } },
    });

    const results: Array<{
        bookingRef: string | null;
        status: string;
        error?: string;
    }> = [];

    // Instantiate Stripe here (not at module level) to avoid build-time errors
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-01-27.acacia' });

    for (const booking of bookings) {
        const bookingRef = booking.bookingRef ?? booking.id;

        try {
            // Move to BALANCE_PENDING to prevent duplicate charges on re-run
            await prisma.booking.update({
                where: { id: booking.id },
                data: { status: 'BALANCE_PENDING' },
            });

            // Attempt off-session charge
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round((booking.balanceAmount ?? 0) * 100), // pence/grosz
                currency: (booking.currency ?? 'pln').toLowerCase(),
                customer: booking.stripeCustomerId!,
                payment_method: booking.stripePaymentMethodId!,
                off_session: true,
                confirm: true,
                description: `Balance charge for booking ${bookingRef} — ${booking.room.name}`,
                metadata: {
                    bookingRef: bookingRef ?? '',
                    zohoBookingDealId: booking.zohoBookingDealId ?? '',
                },
            });

            // Success
            await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    status: 'FULLY_PAID',
                    balancePaidAt: new Date(),
                    stripeBalanceId: paymentIntent.id,
                    paymentStatus: 'paid',
                },
            });

            // Update Zoho Deal status (fire-and-forget)
            await updateZohoDealStatus(booking.zohoBookingDealId, 'Fully Paid').catch((err) =>
                console.error(`[Cron] Zoho update failed for ${bookingRef}:`, err)
            );

            results.push({ bookingRef, status: 'FULLY_PAID' });
            console.log(`[Cron] ✅ Balance charged: ${bookingRef} — ${booking.balanceAmount} ${booking.currency}`);

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown Stripe error';
            console.error(`[Cron] ❌ Charge failed: ${bookingRef} — ${msg}`);

            await prisma.booking.update({
                where: { id: booking.id },
                data: { status: 'PAYMENT_FAILED', paymentStatus: 'failed' },
            });

            await updateZohoDealStatus(booking.zohoBookingDealId, 'Payment Failed').catch(() => { });

            results.push({ bookingRef, status: 'PAYMENT_FAILED', error: msg });
        }
    }

    return NextResponse.json({
        processed: bookings.length,
        results,
        targetDate: targetDate.toISOString().split('T')[0],
    });
}

/**
 * Update the Zoho CRM Deal status for the given deal ID.
 * Zoho workflows on that status change handle all guest communication.
 */
async function updateZohoDealStatus(zohoBookingDealId: string | null, status: string): Promise<void> {
    if (!zohoBookingDealId) return;

    const baseUrl = process.env.ZOHO_API_DOMAIN ?? 'https://www.zohoapis.eu';
    const accessToken = await getZohoAccessToken();

    const res = await fetch(`${baseUrl}/crm/v2/Deals/${zohoBookingDealId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            data: [{ id: zohoBookingDealId, Stage: status }],
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Zoho update failed (${res.status}): ${err.substring(0, 200)}`);
    }
}

async function getZohoAccessToken(): Promise<string> {
    const res = await fetch('https://accounts.zoho.eu/oauth/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: process.env.ZOHO_REFRESH_TOKEN ?? '',
            client_id: process.env.ZOHO_CLIENT_ID ?? '',
            client_secret: process.env.ZOHO_CLIENT_SECRET ?? '',
            grant_type: 'refresh_token',
        }),
    });
    const data = await res.json() as { access_token?: string };
    if (!data.access_token) throw new Error('Failed to get Zoho access token');
    return data.access_token;
}
