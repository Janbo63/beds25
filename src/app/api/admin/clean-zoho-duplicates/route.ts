import { NextRequest, NextResponse } from 'next/server';
import zohoClient from '@/lib/zoho';
import { ZOHO_MODULES } from '@/lib/zoho-service';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/clean-zoho-duplicates — Dry-run: show what would be deleted
 * POST /api/admin/clean-zoho-duplicates — Execute: delete duplicates
 *
 * Logic: If two Zoho bookings share the same Check_In + Check_Out + Room,
 * keep the one WITH Beds24ID/Beds25ID and delete the one WITHOUT.
 */
export async function GET(request: NextRequest) {
    return cleanDuplicates(true);
}

export async function POST(request: NextRequest) {
    return cleanDuplicates(false);
}

async function cleanDuplicates(dryRun: boolean) {
    try {
        // 1. Fetch ALL Zoho bookings (future ones + recent)
        const allBookings: any[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await zohoClient.getRecords(ZOHO_MODULES.BOOKINGS, {
                fields: ['id', 'Name', 'Guest', 'Check_In', 'Check_Out', 'Room', 'Beds24ID', 'Beds25ID', 'Total_Price', 'Booking_status'],
                page,
                per_page: 200,
            });

            if (response.data && response.data.length > 0) {
                allBookings.push(...response.data);
                hasMore = response.info?.more_records || false;
                page++;
            } else {
                hasMore = false;
            }
        }

        // 2. Group by Check_In + Check_Out + Room to find duplicates
        const groupKey = (b: any) => {
            const roomId = b.Room?.id || b.Room || 'no-room';
            return `${b.Check_In}|${b.Check_Out}|${roomId}`;
        };

        const groups = new Map<string, any[]>();
        for (const booking of allBookings) {
            const key = groupKey(booking);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(booking);
        }

        // 3. For each group with duplicates, decide which to keep and which to delete
        const toDelete: any[] = [];
        const toKeep: any[] = [];

        for (const [key, bookings] of groups) {
            if (bookings.length <= 1) continue; // No duplicates

            // Separate: bookings WITH IDs vs WITHOUT IDs
            const withIds = bookings.filter((b: any) => b.Beds24ID || b.Beds25ID);
            const withoutIds = bookings.filter((b: any) => !b.Beds24ID && !b.Beds25ID);

            if (withIds.length > 0 && withoutIds.length > 0) {
                // Keep ones with IDs, delete ones without
                toKeep.push(...withIds);
                toDelete.push(...withoutIds.map((b: any) => ({
                    id: b.id,
                    name: b.Name,
                    guest: b.Guest?.name || '',
                    checkIn: b.Check_In,
                    checkOut: b.Check_Out,
                    room: b.Room?.Room_Name || b.Room?.name || '',
                    reason: `Duplicate of ${withIds.map((w: any) => w.Name).join(', ')} (which has Beds24ID/Beds25ID)`,
                })));
            }
        }

        // 4. Execute deletions
        let deleted = 0;
        const deleteResults: any[] = [];

        if (!dryRun) {
            for (const record of toDelete) {
                try {
                    await zohoClient.deleteRecord(ZOHO_MODULES.BOOKINGS, record.id);
                    deleteResults.push({ ...record, status: 'deleted' });
                    deleted++;
                } catch (err: any) {
                    deleteResults.push({ ...record, status: 'error', error: err?.message });
                }
            }
        }

        return NextResponse.json({
            dryRun,
            totalZohoBookings: allBookings.length,
            duplicateGroupsFound: [...groups.values()].filter(g => g.length > 1).length,
            toDelete: dryRun ? toDelete : deleteResults,
            toDeleteCount: toDelete.length,
            deleted,
        });
    } catch (error: any) {
        console.error('[CleanZohoDuplicates] Error:', error);
        return NextResponse.json(
            { error: 'Cleanup failed', message: error?.message },
            { status: 500 }
        );
    }
}
