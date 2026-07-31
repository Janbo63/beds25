import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * ONE-TIME audit + fix for website bookings whose source/notes/guest-counts
 * were overwritten by the Beds24 webhook echo-back.
 * 
 * GET /api/public/fix-sources?key=beds25-source-fix-2026-07-31          → audit only
 * GET /api/public/fix-sources?key=beds25-source-fix-2026-07-31&fix=true → apply fixes
 */
export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-source-fix-2026-07-31') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    // Find bookings that are clearly website-originated but have source=BEDS24
    // Indicators of a website booking:
    //  - Has Stripe payment data (depositAmount, stripeDepositId, stripeCustomerId, etc.)
    //  - Has paymentMethod = 'card'
    //  - Has depositAmount > 0
    const corrupted = await prisma.booking.findMany({
        where: {
            OR: [
                { source: 'BEDS24', stripeDepositId: { not: null } },
                { source: 'BEDS24', stripeCustomerId: { not: null } },
                { source: 'BEDS24', stripePaymentMethodId: { not: null } },
                { source: 'BEDS24', stripePaymentIntentId: { not: null } },
                { source: 'BEDS24', depositAmount: { not: null, gt: 0 } },
                { source: 'BEDS24', paymentMethod: 'card' },
            ],
        },
        include: { room: { select: { name: true } } },
        orderBy: { checkIn: 'asc' },
    });

    // Also find bookings with notes = "Updated via Webhook from BEDS24" that have deposit data
    const notesCorrupted = await prisma.booking.findMany({
        where: {
            notes: { contains: 'Updated via Webhook' },
            depositAmount: { not: null, gt: 0 },
            source: { not: 'Website' },
        },
        include: { room: { select: { name: true } } },
    });

    // Merge and deduplicate
    const allCorrupted = new Map<string, any>();
    for (const b of [...corrupted, ...notesCorrupted]) {
        allCorrupted.set(b.id, b);
    }

    const results = [];

    for (const b of allCorrupted.values()) {
        const issues: string[] = [];
        if (b.source === 'BEDS24') issues.push('source=BEDS24');
        if (b.notes?.includes('Updated via Webhook')) issues.push('notes_overwritten');
        if (b.numAdults === 1 && b.numChildren === 0) issues.push('guest_counts_likely_wrong');
        if (!b.guestEmail) issues.push('email_missing');

        const result: any = {
            id: b.id,
            guest: b.guestName,
            email: b.guestEmail || 'NONE',
            room: b.room?.name || 'N/A',
            checkIn: b.checkIn?.toISOString().split('T')[0],
            checkOut: b.checkOut?.toISOString().split('T')[0],
            source: b.source,
            status: b.status,
            deposit: b.depositAmount,
            adults: b.numAdults,
            children: b.numChildren,
            notes: (b.notes || '').substring(0, 80),
            issues,
        };

        if (applyFix) {
            // Restore source to Website
            const fixData: any = {
                source: 'Website',
            };

            // Clear the webhook overwrite note
            if (b.notes?.includes('Updated via Webhook')) {
                fixData.notes = null;
            }

            await prisma.booking.update({
                where: { id: b.id },
                data: fixData,
            });

            // Sync to Zoho
            let zohoSynced = false;
            try {
                const { bookingService } = await import('@/lib/zoho-service');
                const freshBooking = await prisma.booking.findUnique({
                    where: { id: b.id },
                    include: { room: true },
                });
                if (freshBooking?.room) {
                    await bookingService.syncToZoho(freshBooking, freshBooking.room);
                    zohoSynced = true;
                }
            } catch {
                // Non-fatal
            }

            result.action = 'FIXED';
            result.newSource = 'Website';
            result.zohoSynced = zohoSynced;
        } else {
            result.action = 'AUDIT_ONLY';
        }

        results.push(result);
    }

    return NextResponse.json({
        message: applyFix ? 'Source fix applied' : 'Audit only — add &fix=true to apply',
        total: results.length,
        timestamp: new Date().toISOString(),
        results,
    });
}
