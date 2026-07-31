import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * ONE-TIME fix endpoint to correct DEPOSIT_PAID statuses corrupted by the
 * Beds24 webhook echo-back bug. Remove this file after running.
 * 
 * GET /api/public/fix-statuses?key=beds25-fix-2026-07-31
 */
export async function GET(request: NextRequest) {
    const key = new URL(request.url).searchParams.get('key');
    if (key !== 'beds25-fix-2026-07-31') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    const BOOKINGS_TO_FIX = [
        { id: 'cms8qjp9z0000jmstope86emn', guest: 'Kamila Kozaczyk', balance: 558 },
        { id: 'cmq5bclp20001jmwn40zv5z0x', guest: 'natalia.brzezny', balance: 891 },
        { id: 'cmrhsowv70007jmhxfhjm8b79', guest: 'oliwa84@wp.pl', balance: 1116 },
        { id: 'cmq6nw6ey0003jmevls76yzto', guest: 'Mekmann03', balance: 1107 },
    ];

    const results = [];

    for (const fix of BOOKINGS_TO_FIX) {
        const booking = await prisma.booking.findUnique({ where: { id: fix.id } });

        if (!booking) {
            results.push({ guest: fix.guest, status: 'NOT_FOUND' });
            continue;
        }

        // Don't downgrade if already in a later payment state
        if (['FULLY_PAID', 'BALANCE_PENDING'].includes(booking.status)) {
            results.push({
                guest: fix.guest,
                status: 'SKIPPED',
                reason: `Already ${booking.status}`,
                currentStatus: booking.status,
            });
            continue;
        }

        if (booking.status === 'DEPOSIT_PAID') {
            results.push({
                guest: fix.guest,
                status: 'ALREADY_CORRECT',
                currentStatus: booking.status,
            });
            continue;
        }

        // Fix the status
        await prisma.booking.update({
            where: { id: fix.id },
            data: {
                status: 'DEPOSIT_PAID',
                paymentStatus: 'partial',
            },
        });

        // Also sync to Zoho
        let zohoSynced = false;
        try {
            const { bookingService } = await import('@/lib/zoho-service');
            const fullBooking = await prisma.booking.findUnique({
                where: { id: fix.id },
                include: { room: true },
            });
            if (fullBooking?.room) {
                await bookingService.syncToZoho(fullBooking, fullBooking.room);
                zohoSynced = true;
            }
        } catch {
            // Non-fatal
        }

        results.push({
            guest: fix.guest,
            status: 'FIXED',
            previousStatus: booking.status,
            newStatus: 'DEPOSIT_PAID',
            balance: fix.balance,
            zohoSynced,
        });
    }

    return NextResponse.json({
        message: 'Status fix completed',
        timestamp: new Date().toISOString(),
        results,
    });
}
