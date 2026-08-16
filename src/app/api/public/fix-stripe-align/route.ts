import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * ONE-TIME: Align all 4 website bookings with correct Stripe data from the reconciliation audit.
 * Sets correct deposit IDs, balance IDs, customer IDs, payment method IDs, and status.
 *
 * GET /api/public/fix-stripe-align?key=beds25-stripe-align-aug16         → audit
 * GET /api/public/fix-stripe-align?key=beds25-stripe-align-aug16&fix=true → apply
 */

const CORRECTIONS = [
    {
        // Michael Kaufmann — Jul 28-31
        localId: 'cmq6nw6ey0003jmevls76yzto',
        guest: 'Michael Kaufmann',
        deposit: { amount: 123, piId: 'pi_3TgAFQAD13kepUrh0DHOfrky', customerId: 'cus_UfUvBf0buOfuER', pmId: 'pm_1TgAFjAD13kepUrhRNzQdTyD' },
        balance: { amount: 1107, piId: 'pi_3TzE0AAD13kepUrh0f6WBECG', paidAt: '2026-07-31' },
        totalPrice: 1230,
        newStatus: 'FULLY_PAID',
    },
    {
        // Paweł Olejniczak — Aug 3-7
        localId: 'cmrhsowv70007jmhxfhjm8b79',
        guest: 'Paweł Olejniczak',
        deposit: { amount: 124, piId: 'pi_3Tq9JKAD13kepUrh0eaoi0Uz', customerId: 'cus_Up8JpLEeiP845B', pmId: null }, // PM unknown, need Stripe lookup
        balance: { amount: 1116, piId: 'pi_3U0fVUAD13kepUrh1HL8ECqy', paidAt: '2026-08-04' },
        totalPrice: 1240,
        newStatus: 'FULLY_PAID',
    },
    {
        // Natalia Schneeweis — Aug 9-12
        localId: 'cmq5bclp20001jmwn40zv5z0x',
        guest: 'Natalia Schneeweis',
        deposit: { amount: 99, piId: 'pi_3TfQaTAD13kepUrh1nSfqptO', customerId: 'cus_Uek4jMFiRXKPnW', pmId: 'pm_1TfQbdAD13kepUrhvpA56cXc' },
        balance: { amount: 891, piId: 'pi_3U2y7eAD13kepUrh0gw3ofrl', paidAt: '2026-08-10' },
        totalPrice: 990,
        newStatus: 'FULLY_PAID',
    },
    {
        // Kamila Kozaczyk — Aug 14-16
        // Deposit PI from Stripe metadata: bookingRef=ZAP-896001, zohoBookingDealId=884394000001896001
        localId: 'cms8qjp9z0000jmstope86emn',
        guest: 'Kamila Kozaczyk',
        deposit: { amount: 62, piId: 'pi_3TxpacAD13kepUrh0WQzdScb', customerId: 'cus_Uxl6joUGPoXEsX', pmId: null },
        balance: { amount: 558, piId: 'pi_3U4NKcAD13kepUrh0CyaU47H', paidAt: '2026-08-14' },
        totalPrice: 620,
        newStatus: 'FULLY_PAID',
    },
];

export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-stripe-align-aug16') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    // Try to resolve missing payment methods from Stripe
    let stripe: any = null;
    try {
        const { default: Stripe } = await import('stripe');
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-01-27.acacia' });
    } catch { /* non-fatal */ }

    const results: any[] = [];

    for (const correction of CORRECTIONS) {
        const booking = await prisma.booking.findUnique({
            where: { id: correction.localId },
            include: { room: { select: { name: true } } },
        });

        if (!booking) {
            results.push({ guest: correction.guest, action: 'NOT_FOUND', id: correction.localId });
            continue;
        }

        // Resolve payment method if missing
        let depositPM = correction.deposit.pmId;
        if (!depositPM && stripe && correction.deposit.piId) {
            try {
                const pi = await stripe.paymentIntents.retrieve(correction.deposit.piId);
                depositPM = pi.payment_method as string || null;
            } catch { /* non-fatal */ }
        }

        const before = {
            status: booking.status,
            depositAmount: booking.depositAmount,
            balanceAmount: booking.balanceAmount,
            totalPrice: booking.totalPrice,
            stripeDepositId: booking.stripeDepositId || null,
            stripeBalanceId: booking.stripeBalanceId || null,
            stripeCustomerId: booking.stripeCustomerId || null,
            stripePaymentMethodId: booking.stripePaymentMethodId || null,
            paymentStatus: booking.paymentStatus,
        };

        const after = {
            status: correction.newStatus,
            depositAmount: correction.deposit.amount,
            balanceAmount: correction.balance.amount,
            totalPrice: correction.totalPrice,
            stripeDepositId: correction.deposit.piId,
            stripeBalanceId: correction.balance.piId,
            stripeCustomerId: correction.deposit.customerId,
            stripePaymentMethodId: depositPM,
            paymentStatus: 'Fully Paid',
            paymentMethod: 'card',
            balancePaidAt: new Date(correction.balance.paidAt),
        };

        const result: any = {
            guest: correction.guest,
            room: booking.room?.name,
            before,
            after: applyFix ? after : '(preview)',
        };

        if (applyFix) {
            await prisma.booking.update({
                where: { id: correction.localId },
                data: {
                    status: correction.newStatus,
                    depositAmount: correction.deposit.amount,
                    depositPaidAt: booking.depositPaidAt || booking.createdAt,
                    balanceAmount: correction.balance.amount,
                    balancePaidAt: new Date(correction.balance.paidAt),
                    totalPrice: correction.totalPrice,
                    stripeDepositId: correction.deposit.piId,
                    stripeBalanceId: correction.balance.piId,
                    stripeCustomerId: correction.deposit.customerId,
                    stripePaymentMethodId: depositPM,
                    paymentStatus: 'Fully Paid',
                    paymentMethod: 'card',
                },
            });

            // Sync to Zoho
            let zohoSynced = false;
            try {
                const { bookingService } = await import('@/lib/zoho-service');
                const fresh = await prisma.booking.findUnique({
                    where: { id: correction.localId },
                    include: { room: true },
                });
                if (fresh?.room) {
                    await bookingService.syncToZoho(fresh, fresh.room);
                    zohoSynced = true;
                }
            } catch { /* non-fatal */ }

            result.action = 'FIXED';
            result.zohoSynced = zohoSynced;
            result.after = after;
        } else {
            result.action = 'AUDIT_ONLY';
        }

        results.push(result);
    }

    return NextResponse.json({
        message: applyFix
            ? 'All 4 bookings aligned with Stripe — status updated to FULLY_PAID'
            : 'Audit only — add &fix=true to apply',
        total: results.length,
        timestamp: new Date().toISOString(),
        note: 'The 120 unmatched Stripe payments are historic (2021-2025) from the old Beds24 booking page and do not need linking.',
        results,
    });
}
