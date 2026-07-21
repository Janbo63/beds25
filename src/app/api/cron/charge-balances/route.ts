import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * T-3 Balance Charge Cron
 * POST /api/cron/charge-balances
 *
 * Runs daily at 08:00 UTC via system cron on the VPS.
 * Finds all DEPOSIT_PAID bookings where checkIn is exactly 3 days away
 * and attempts to charge the saved payment method for the balance.
 *
 * On success → updates Zoho status to "Fully Paid"
 *              → Zoho Workflow Rule sends guest confirmation email
 * On failure → updates Zoho status to "Payment Failed"
 *              → Zoho Workflow Rule sends admin alert email
 *
 * All guest/admin emails are handled by Zoho CRM Workflow Rules
 * for consistency with the existing booking confirmation flow.
 */
export async function POST(request: NextRequest) {
    // Verify this is called by system cron or internal systems
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

    // Find bookings due for balance charge (deposit paid, T-3 days before check-in)
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
        const currency = booking.currency ?? 'PLN';
        const amountStr = `${(booking.balanceAmount ?? 0).toFixed(2)} ${currency}`;

        try {
            // Move to BALANCE_PENDING to prevent duplicate charges on re-run
            await prisma.booking.update({
                where: { id: booking.id },
                data: { status: 'BALANCE_PENDING' },
            });

            // Attempt off-session charge
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round((booking.balanceAmount ?? 0) * 100), // pence/grosz
                currency: currency.toLowerCase(),
                customer: booking.stripeCustomerId!,
                payment_method: booking.stripePaymentMethodId!,
                off_session: true,
                confirm: true,
                description: `Balance charge for booking ${bookingRef} — ${booking.room.name}`,
                metadata: {
                    bookingRef: bookingRef ?? '',
                    zohoBookingDealId: booking.zohoBookingDealId ?? '',
                    type: 'booking_balance',
                },
            });

            // Success → FULLY_PAID
            await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    status: 'FULLY_PAID',
                    balancePaidAt: new Date(),
                    stripeBalanceId: paymentIntent.id,
                    paymentStatus: 'paid',
                },
            });

            // Update Zoho Booking → "Fully Paid"
            // This triggers Zoho Workflow Rule to send guest confirmation email
            await updateZohoBookingStatus(booking.zohoBookingDealId, 'Fully Paid', {
                Payment_status: 'Fully Paid',
                Stripe_Balance_ID: paymentIntent.id,
            }).catch((err) =>
                console.error(`[Cron] Zoho update failed for ${bookingRef}:`, err)
            );

            results.push({ bookingRef, status: 'FULLY_PAID' });
            console.log(`[Cron] ✅ Balance charged: ${bookingRef} — ${amountStr}`);

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown Stripe error';
            console.error(`[Cron] ❌ Charge failed: ${bookingRef} — ${msg}`);

            // Mark as PAYMENT_FAILED
            await prisma.booking.update({
                where: { id: booking.id },
                data: { status: 'PAYMENT_FAILED', paymentStatus: 'failed' },
            });

            // Update Zoho Booking → "Payment Failed"
            // This triggers Zoho Workflow Rule to send admin alert email
            await updateZohoBookingStatus(booking.zohoBookingDealId, 'Payment Failed', {
                Payment_status: 'Payment Failed',
                Booking_Notes_Append: `Balance charge failed (${format(today, 'dd.MM.yyyy')}): ${msg.substring(0, 200)}`,
            }).catch(() => { });

            results.push({ bookingRef, status: 'PAYMENT_FAILED', error: msg });
        }
    }

    // Log to Stef Dashboard (fire-and-forget)
    if (results.length > 0) {
        logToStef(results).catch(() => { });
    }

    return NextResponse.json({
        processed: bookings.length,
        results,
        targetDate: targetDate.toISOString().split('T')[0],
    });
}

/**
 * Update the Zoho CRM Booking record status + optional extra fields.
 */
async function updateZohoBookingStatus(
    zohoBookingId: string | null,
    status: string,
    extraFields?: Record<string, any>
): Promise<void> {
    if (!zohoBookingId) return;

    const baseUrl = process.env.ZOHO_API_DOMAIN ?? 'https://www.zohoapis.eu';
    const accessToken = await getZohoAccessToken();

    const updateData: Record<string, any> = {
        id: zohoBookingId,
        Booking_status: status,
        ...extraFields,
    };

    const res = await fetch(`${baseUrl}/crm/v2/Bookings/${zohoBookingId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: [updateData] }),
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

/**
 * Log balance charge results to Stef Dashboard (centralised monitoring)
 */
async function logToStef(results: Array<{ bookingRef: string | null; status: string; error?: string }>) {
    const succeeded = results.filter(r => r.status === 'FULLY_PAID').length;
    const failed = results.filter(r => r.status === 'PAYMENT_FAILED').length;
    const level = failed > 0 ? 'error' : 'info';

    try {
        await fetch(process.env.STEF_LOG_URL || 'https://stef.futuresolutionsai.com/api/logs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.STEF_LOG_KEY || 'fs-log-key-2026',
            },
            body: JSON.stringify({
                app: 'beds25',
                level,
                message: `Balance charge cron: ${succeeded} succeeded, ${failed} failed out of ${results.length}`,
                metadata: { results },
            }),
        });
    } catch {
        console.error('[Cron] Stef log failed (non-fatal)');
    }
}
