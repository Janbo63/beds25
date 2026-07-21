import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { format } from 'date-fns';
import {
    sendBalanceChargedEmail,
    sendChargeFailedAlert,
    sendDailyChargeSummary,
} from '@/lib/email-service';

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
 * On success → emails guest "balance charged, booking fully paid"
 * On failure → emails admins (Jan + Dorota) with error details
 * After all   → sends daily summary to admins
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

    // Track for daily summary email
    const succeeded: Array<{ bookingRef: string; guestName: string; amount: string }> = [];
    const failed: Array<{ bookingRef: string; guestName: string; amount: string; error: string }> = [];

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

            // Update Zoho Deal status (fire-and-forget)
            await updateZohoDealStatus(booking.zohoBookingDealId, 'Fully Paid').catch((err) =>
                console.error(`[Cron] Zoho update failed for ${bookingRef}:`, err)
            );

            // Send guest notification email
            const checkInStr = format(new Date(booking.checkIn), 'dd.MM.yyyy');
            const checkOutStr = format(new Date(booking.checkOut), 'dd.MM.yyyy');
            await sendBalanceChargedEmail({
                guestEmail: booking.guestEmail ?? '',
                guestName: booking.guestName ?? 'Guest',
                bookingRef: bookingRef ?? '',
                roomName: booking.room?.name ?? 'Room',
                checkIn: checkInStr,
                checkOut: checkOutStr,
                balanceAmount: booking.balanceAmount ?? 0,
                currency,
                locale: 'pl', // Most bookings are Polish; locale not stored on booking
            }).catch((emailErr) =>
                console.error(`[Cron] Guest email failed for ${bookingRef}:`, emailErr)
            );

            results.push({ bookingRef, status: 'FULLY_PAID' });
            succeeded.push({ bookingRef: bookingRef ?? '', guestName: booking.guestName ?? '', amount: amountStr });
            console.log(`[Cron] ✅ Balance charged: ${bookingRef} — ${amountStr}`);

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown Stripe error';
            console.error(`[Cron] ❌ Charge failed: ${bookingRef} — ${msg}`);

            // Mark as PAYMENT_FAILED
            await prisma.booking.update({
                where: { id: booking.id },
                data: { status: 'PAYMENT_FAILED', paymentStatus: 'failed' },
            });

            await updateZohoDealStatus(booking.zohoBookingDealId, 'Payment Failed').catch(() => { });

            // Send immediate admin alert for failures
            await sendChargeFailedAlert({
                bookingRef: bookingRef ?? '',
                guestName: booking.guestName ?? 'Unknown',
                guestEmail: booking.guestEmail ?? 'N/A',
                roomName: booking.room?.name ?? 'Room',
                checkIn: format(new Date(booking.checkIn), 'dd.MM.yyyy'),
                balanceAmount: booking.balanceAmount ?? 0,
                currency,
                error: msg,
            }).catch((emailErr) =>
                console.error(`[Cron] Admin alert email failed:`, emailErr)
            );

            results.push({ bookingRef, status: 'PAYMENT_FAILED', error: msg });
            failed.push({ bookingRef: bookingRef ?? '', guestName: booking.guestName ?? '', amount: amountStr, error: msg });
        }
    }

    // Send daily summary to admins (if any bookings were processed)
    if (succeeded.length > 0 || failed.length > 0) {
        await sendDailyChargeSummary({
            date: format(today, 'dd.MM.yyyy'),
            succeeded,
            failed,
        }).catch((emailErr) =>
            console.error('[Cron] Daily summary email failed:', emailErr)
        );
    }

    return NextResponse.json({
        processed: bookings.length,
        results,
        targetDate: targetDate.toISOString().split('T')[0],
    });
}

/**
 * Update the Zoho CRM Booking status.
 */
async function updateZohoDealStatus(zohoBookingDealId: string | null, status: string): Promise<void> {
    if (!zohoBookingDealId) return;

    const baseUrl = process.env.ZOHO_API_DOMAIN ?? 'https://www.zohoapis.eu';
    const accessToken = await getZohoAccessToken();

    const res = await fetch(`${baseUrl}/crm/v2/Bookings/${zohoBookingDealId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            data: [{ id: zohoBookingDealId, Booking_status: status, Payment_status: status }],
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
