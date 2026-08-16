import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * ONE-TIME: Link Stripe payments to the 3 early-July website bookings
 * whose payment data was wiped by the Beds24 echo-back bug.
 *
 * GET /api/public/fix-july-payments?key=beds25-july-fix         → audit
 * GET /api/public/fix-july-payments?key=beds25-july-fix&fix=true → apply
 */

const CORRECTIONS = [
    {
        guest: 'Lukasz Kumor',
        bookingRef: 'ZAP-701001',
        matchBy: { guestName: { contains: 'Kumor' }, checkIn: new Date('2026-07-17') },
        deposit: { amount: 62, piId: 'pi_3TpRA5AD13kepUrh0XOMO2Us', customerId: 'cus_Up5Kh1LSCAHN4Y' },
        balance: { amount: 562, piId: 'pi_3TvDoTAD13kepUrh0gzEcd26', paidAt: '2026-07-20' },
        totalPrice: 624,
        guestEmail: 'wibowit@gmail.com',
        newStatus: 'FULLY_PAID',
    },
    {
        guest: 'Janusz Siwoń',
        bookingRef: 'ZAP-716001',
        matchBy: { guestName: { contains: 'Siwo' }, checkIn: new Date('2026-07-21') },
        deposit: { amount: 161, piId: 'pi_3TpZ3dAD13kepUrh0RXBSCVr', customerId: 'cus_Up7Kk6UB3qCYnj' },
        balance: { amount: 1449, piId: 'pi_3TvIIhAD13kepUrh0xUoTrNE', paidAt: '2026-07-20' },
        totalPrice: 1610,
        guestEmail: 'jas28@tlen.pl',
        newStatus: 'FULLY_PAID',
    },
    {
        guest: 'beata michnik',
        bookingRef: 'ZAP-678001',
        matchBy: { guestName: { contains: 'michnik' }, checkIn: new Date('2026-07-05') },
        deposit: { amount: 93, piId: 'pi_3TnlU6AD13kepUrh1an3JORR', customerId: 'cus_UnMCB1zFDK7UNn' },
        balance: null, // No balance payment found in Stripe!
        totalPrice: 932,
        guestEmail: 'boberland@op.pl',
        newStatus: 'DEPOSIT_PAID', // Cannot mark FULLY_PAID — balance not collected
    },
];

export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-july-fix') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    // Resolve payment methods from Stripe
    let stripe: any = null;
    try {
        const { default: Stripe } = await import('stripe');
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-01-27.acacia' });
    } catch { /* non-fatal */ }

    const results: any[] = [];

    for (const correction of CORRECTIONS) {
        const booking = await prisma.booking.findFirst({
            where: correction.matchBy as any,
            include: { room: { select: { name: true } } },
        });

        if (!booking) {
            results.push({ guest: correction.guest, action: 'NOT_FOUND' });
            continue;
        }

        // Resolve PM from Stripe
        let depositPM: string | null = null;
        if (stripe && correction.deposit.piId) {
            try {
                const pi = await stripe.paymentIntents.retrieve(correction.deposit.piId);
                depositPM = pi.payment_method as string || null;
            } catch { /* non-fatal */ }
        }

        const before = {
            status: booking.status,
            source: booking.source,
            guestEmail: booking.guestEmail,
            depositAmount: booking.depositAmount,
            balanceAmount: booking.balanceAmount,
            totalPrice: booking.totalPrice,
            stripeDepositId: booking.stripeDepositId || null,
            stripeBalanceId: booking.stripeBalanceId || null,
            stripeCustomerId: booking.stripeCustomerId || null,
            paymentStatus: booking.paymentStatus,
        };

        const updateData: Record<string, any> = {
            // Don't overwrite CANCELLED status — michnik was a no-show
            status: booking.status === 'CANCELLED' ? 'CANCELLED' : correction.newStatus,
            source: 'Website',
            guestEmail: correction.guestEmail,
            depositAmount: correction.deposit.amount,
            totalPrice: correction.totalPrice,
            stripeDepositId: correction.deposit.piId,
            stripeCustomerId: correction.deposit.customerId,
            stripePaymentMethodId: depositPM,
            paymentMethod: 'card',
            bookingRef: correction.bookingRef,
        };

        if (correction.balance) {
            updateData.balanceAmount = correction.balance.amount;
            updateData.stripeBalanceId = correction.balance.piId;
            updateData.balancePaidAt = new Date(correction.balance.paidAt);
            updateData.paymentStatus = 'Fully Paid';
        } else {
            updateData.balanceAmount = correction.totalPrice - correction.deposit.amount;
            updateData.paymentStatus = 'partial';
        }

        const result: any = {
            guest: correction.guest,
            room: booking.room?.name,
            bookingRef: correction.bookingRef,
            before,
            newStatus: correction.newStatus,
            balanceCollected: correction.balance ? `✅ ${correction.balance.amount} PLN (${correction.balance.paidAt})` : '❌ NOT FOUND — 839 PLN may be uncollected',
        };

        if (applyFix) {
            await prisma.booking.update({
                where: { id: booking.id },
                data: updateData,
            });

            // Sync to Zoho
            let zohoSynced = false;
            try {
                const { bookingService } = await import('@/lib/zoho-service');
                const fresh = await prisma.booking.findUnique({
                    where: { id: booking.id },
                    include: { room: true },
                });
                if (fresh?.room) {
                    await bookingService.syncToZoho(fresh, fresh.room);
                    zohoSynced = true;
                }
            } catch { /* non-fatal */ }

            result.action = 'FIXED';
            result.zohoSynced = zohoSynced;
        } else {
            result.action = 'AUDIT_ONLY';
        }

        results.push(result);
    }

    return NextResponse.json({
        message: applyFix
            ? 'July website bookings aligned with Stripe data'
            : 'Audit only — add &fix=true to apply',
        total: results.length,
        timestamp: new Date().toISOString(),
        warning: '⚠️ beata michnik: 839 PLN balance NOT found in Stripe — may need manual collection or confirmation that it was paid in cash.',
        results,
    });
}
