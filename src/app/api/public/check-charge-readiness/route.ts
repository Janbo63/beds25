import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Check if the remaining 3 bookings have the fields needed for auto-charge.
 * GET /api/public/check-charge-readiness?key=beds25-check-2026-07-31
 */
export async function GET(request: NextRequest) {
    const key = new URL(request.url).searchParams.get('key');
    if (key !== 'beds25-check-2026-07-31') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    const ids = [
        'cmrhsowv70007jmhxfhjm8b79', // Paweł - Aug 3
        'cmq5bclp20001jmwn40zv5z0x', // Natalia - Aug 9
        'cms8qjp9z0000jmstope86emn', // Kamila - Aug 14
        'cmq6nw6ey0003jmevls76yzto', // Kaufmann - Jul 28 (done)
    ];

    const bookings = await prisma.booking.findMany({
        where: { id: { in: ids } },
        include: { room: { select: { name: true } } },
        orderBy: { checkIn: 'asc' },
    });

    const results = bookings.map(b => {
        const checkIn = b.checkIn ? new Date(b.checkIn) : null;
        const balanceDue = checkIn ? new Date(checkIn.getTime() - 3 * 24 * 60 * 60 * 1000) : null;

        const cronReady = !!(
            b.status === 'DEPOSIT_PAID' &&
            b.stripeCustomerId &&
            b.stripePaymentMethodId &&
            b.balanceAmount && b.balanceAmount > 0 &&
            !b.balancePaidAt
        );

        const missing: string[] = [];
        if (b.status !== 'DEPOSIT_PAID') missing.push(`status=${b.status} (need DEPOSIT_PAID)`);
        if (!b.stripeCustomerId) missing.push('stripeCustomerId');
        if (!b.stripePaymentMethodId) missing.push('stripePaymentMethodId');
        if (!b.balanceAmount || b.balanceAmount <= 0) missing.push('balanceAmount');
        if (b.balancePaidAt) missing.push('already paid');

        return {
            guest: b.guestName,
            email: b.guestEmail,
            room: b.room?.name,
            checkIn: checkIn?.toISOString().split('T')[0],
            balanceDueDate: balanceDue?.toISOString().split('T')[0],
            status: b.status,
            balanceAmount: b.balanceAmount,
            stripeCustomerId: b.stripeCustomerId || 'MISSING',
            stripePaymentMethodId: b.stripePaymentMethodId || 'MISSING',
            balancePaidAt: b.balancePaidAt,
            cronReady,
            missing: missing.length > 0 ? missing : 'ALL_GOOD',
        };
    });

    return NextResponse.json({ total: results.length, results });
}
