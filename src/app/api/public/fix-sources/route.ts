import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * ONE-TIME deep fix for 3 website bookings whose data was overwritten by Beds24 webhook.
 * Restores: source, email, guest counts, deposit/balance amounts, notes from Zoho.
 * 
 * GET /api/public/fix-sources?key=beds25-source-fix-2026-07-31          → audit only
 * GET /api/public/fix-sources?key=beds25-source-fix-2026-07-31&fix=true → apply fixes
 */

// Correct data pulled from Zoho CRM + Stripe audit
const FIXES: Record<string, {
    guestEmail: string;
    numAdults: number;
    numChildren: number;
    depositAmount: number;
    balanceAmount: number;
    totalPrice: number;
    stripeDepositId: string;
    guestAges?: string;
}> = {
    // Michael Kaufmann / Mekmann03@gmail.com — ZBo1563
    'cmq6nw6ey0003jmevls76yzto': {
        guestEmail: 'Mekmann03@gmail.com',
        numAdults: 2,
        numChildren: 0,
        depositAmount: 123,
        balanceAmount: 1107,
        totalPrice: 1230,
        stripeDepositId: 'pi_3TgAFQAD13kepUrh0DHOfrky',
    },
    // Paweł Olejniczak / oliwa84@wp.pl — ZBo1570
    'cmrhsowv70007jmhxfhjm8b79': {
        guestEmail: 'oliwa84@wp.pl',
        numAdults: 2,
        numChildren: 0,
        depositAmount: 124,
        balanceAmount: 1116,
        totalPrice: 1240,
        stripeDepositId: 'pi_3TrNMmAD13kepUrh0eVEVajC',
    },
    // Natalia Schneeweis / natalia.brzezny@gmail.com — ZBo1560
    'cmq5bclp20001jmwn40zv5z0x': {
        guestEmail: 'natalia.brzezny@gmail.com',
        numAdults: 2,
        numChildren: 0,
        depositAmount: 99,
        balanceAmount: 891,
        totalPrice: 990,
        stripeDepositId: 'pi_3TfQaTAD13kepUrh1nSfqptO',
    },
};

export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-source-fix-2026-07-31') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    const results = [];

    for (const [bookingId, correctData] of Object.entries(FIXES)) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { room: { select: { name: true } } },
        });

        if (!booking) {
            results.push({ id: bookingId, status: 'NOT_FOUND' });
            continue;
        }

        const before = {
            source: booking.source,
            email: booking.guestEmail || 'NONE',
            adults: booking.numAdults,
            children: booking.numChildren,
            deposit: booking.depositAmount,
            balance: booking.balanceAmount,
            totalPrice: booking.totalPrice,
            notes: (booking.notes || '').substring(0, 80),
            stripeDepositId: booking.stripeDepositId || booking.stripePaymentIntentId || 'NONE',
        };

        const result: any = {
            id: bookingId,
            guest: booking.guestName,
            room: booking.room?.name,
            checkIn: booking.checkIn?.toISOString().split('T')[0],
            before,
            after: applyFix ? {} : '(audit only)',
        };

        if (applyFix) {
            const balanceDueDate = new Date(booking.checkIn!);
            balanceDueDate.setDate(balanceDueDate.getDate() - 3);

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: {
                    source: 'Website',
                    guestEmail: correctData.guestEmail,
                    numAdults: correctData.numAdults,
                    numChildren: correctData.numChildren,
                    depositAmount: correctData.depositAmount,
                    depositPaidAt: new Date(booking.createdAt!),
                    balanceAmount: correctData.balanceAmount,
                    balanceDueDate,
                    totalPrice: correctData.totalPrice,
                    stripeDepositId: correctData.stripeDepositId,
                    paymentMethod: 'card',
                    paymentStatus: 'partial',
                    paymentTiming: 'pay_online_now',
                    notes: null, // Clear webhook overwrite
                },
            });

            // Upsert guest record
            await prisma.guest.upsert({
                where: { email: correctData.guestEmail },
                update: { name: booking.guestName },
                create: { name: booking.guestName, email: correctData.guestEmail },
            });

            // Sync to Zoho
            let zohoSynced = false;
            try {
                const { bookingService } = await import('@/lib/zoho-service');
                const freshBooking = await prisma.booking.findUnique({
                    where: { id: bookingId },
                    include: { room: true },
                });
                if (freshBooking?.room) {
                    await bookingService.syncToZoho(freshBooking, freshBooking.room);
                    zohoSynced = true;
                }
            } catch {
                // Non-fatal
            }

            result.after = {
                source: 'Website',
                email: correctData.guestEmail,
                adults: correctData.numAdults,
                children: correctData.numChildren,
                deposit: correctData.depositAmount,
                balance: correctData.balanceAmount,
                totalPrice: correctData.totalPrice,
                stripeDepositId: correctData.stripeDepositId,
            };
            result.action = 'FIXED';
            result.zohoSynced = zohoSynced;
        } else {
            result.action = 'AUDIT_ONLY';
            result.correctData = correctData;
        }

        results.push(result);
    }

    return NextResponse.json({
        message: applyFix ? 'Deep fix applied — source, email, guests, deposits restored' : 'Audit only — add &fix=true to apply',
        total: results.length,
        timestamp: new Date().toISOString(),
        results,
    });
}
