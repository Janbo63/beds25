import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/cleanup-ghosts?confirm=true
 * Browser-accessible version (same logic as POST)
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    if (url.searchParams.get('confirm') !== 'true') {
        return NextResponse.json({
            message: 'Add ?confirm=true to execute cleanup',
            actions: [
                'Delete ghost Beds25 record for Paweł (884394000001109001)',
                'Delete ghost Beds25 record for Pamela (884394000001130001)',
                'Delete corresponding Zoho records',
                'Fix all BLOCKED → CONFIRMED statuses',
                'Re-sync to Zoho',
            ],
        });
    }
    return runCleanup();
}

export async function POST() {
    return runCleanup();
}

async function runCleanup() {
    const results = {
        ghostsDeleted: [] as string[],
        zohoDeleted: [] as string[],
        statusFixed: [] as string[],
        zohoSynced: [] as string[],
        errors: [] as string[],
    };

    // ========================================
    // STEP 1: Delete the 2 verified ghost records
    // These are Bug #2 artifacts (Zoho ID used as Beds25 ID)
    // with ghost Beds24 IDs that don't actually exist in Beds24
    // ========================================
    const ghostRecords = [
        // Round 1 (already deleted): Paweł 84245492, Pamela 84245498
        // Round 2: confirmed by user as invalid Beds24 IDs
        { 
            externalId: '84245493',
            zohoId: '884394000001208030',
            guest: 'Agnieszka',
        },
        { 
            externalId: '84245496',
            zohoId: '884394000001252001',
            guest: 'Katherina',
        },
    ];

    for (const ghost of ghostRecords) {
        try {
            // Delete by externalId (Beds24 ghost ID) — more reliable than by id
            const deleted = await prisma.booking.deleteMany({
                where: { externalId: ghost.externalId },
            });
            if (deleted.count > 0) {
                results.ghostsDeleted.push(`${ghost.guest}: externalId=${ghost.externalId} (${deleted.count} records)`);
            } else {
                results.errors.push(`${ghost.guest}: externalId=${ghost.externalId} - no record found`);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            results.errors.push(`Delete Beds25 ${ghost.externalId}: ${msg}`);
        }

        // Delete the corresponding Zoho record
        if (ghost.zohoId) {
            try {
                await zohoClient.deleteRecord('Bookings', ghost.zohoId);
                results.zohoDeleted.push(`${ghost.guest}: ${ghost.zohoId}`);
                console.log(`[Cleanup] Deleted ghost Zoho record: ${ghost.zohoId} (${ghost.guest})`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                results.errors.push(`Delete Zoho ${ghost.zohoId}: ${msg}`);
            }
        }
    }

    // ========================================
    // STEP 2: Fix BLOCKED → CONFIRMED for all active bookings
    // BLOCKED was the old Beds24 mapping; it should be CONFIRMED
    // ========================================
    try {
        const blockedBookings = await prisma.booking.findMany({
            where: { status: 'BLOCKED' },
            select: { id: true, guestName: true, zohoId: true },
        });

        for (const booking of blockedBookings) {
            await prisma.booking.update({
                where: { id: booking.id },
                data: { status: 'CONFIRMED' },
            });
            results.statusFixed.push(`${booking.guestName}: ${booking.id} (BLOCKED → CONFIRMED)`);

            // Re-sync to Zoho if linked
            if (booking.zohoId) {
                try {
                    await zohoClient.updateRecord('Bookings', booking.zohoId, {
                        Booking_status: 'Confirmed',
                    });
                    results.zohoSynced.push(`${booking.guestName}: ${booking.zohoId}`);
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    results.errors.push(`Zoho sync ${booking.zohoId}: ${msg}`);
                }
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Status fix: ${msg}`);
    }

    return NextResponse.json({
        success: true,
        summary: {
            ghostsDeleted: results.ghostsDeleted.length,
            zohoDeleted: results.zohoDeleted.length,
            statusFixed: results.statusFixed.length,
            zohoSynced: results.zohoSynced.length,
            errors: results.errors.length,
        },
        details: results,
    });
}
