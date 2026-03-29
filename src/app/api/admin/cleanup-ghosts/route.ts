import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/cleanup-ghosts
 * 
 * Targeted cleanup based on verified facts:
 * 1. Delete 2 ghost Beds25 records (Bug #2 artifacts) + their Zoho records
 * 2. Update all BLOCKED statuses to CONFIRMED
 * 3. Re-sync corrected records to Zoho
 */
export async function POST() {
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
        { 
            beds25Id: '884394000001109001', 
            zohoId: '884394000001213028',
            guest: 'Paweł',
            reason: 'Ghost - Beds24 ID 84245492 does not exist'
        },
        { 
            beds25Id: '884394000001130001', 
            zohoId: '884394000001202038',
            guest: 'Pamela',
            reason: 'Ghost - Beds24 ID 84245498 does not exist'
        },
    ];

    for (const ghost of ghostRecords) {
        try {
            // Delete from Beds25 DB
            await prisma.booking.delete({ where: { id: ghost.beds25Id } });
            results.ghostsDeleted.push(`${ghost.guest}: ${ghost.beds25Id}`);
            console.log(`[Cleanup] Deleted ghost Beds25 record: ${ghost.beds25Id} (${ghost.guest})`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            results.errors.push(`Delete Beds25 ${ghost.beds25Id}: ${msg}`);
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
