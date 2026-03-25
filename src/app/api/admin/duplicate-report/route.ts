import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/duplicate-report
 * 
 * Finds duplicates across all three systems by grouping bookings
 * by guest name + check-in + check-out + room.
 * 
 * For each duplicate group, clearly marks which record to KEEP
 * (the one linked from Beds25) and which to DELETE.
 */
export async function GET() {
    try {
        // 1. Get ALL Beds25 bookings
        const beds25Bookings = await prisma.booking.findMany({
            where: { status: { not: 'CANCELLED' } },
            include: { room: { select: { name: true, roomNumber: true } } },
            orderBy: { checkIn: 'asc' },
        });

        // 2. Group Beds25 bookings by guest+dates+room to find local duplicates
        const beds25Groups = new Map<string, typeof beds25Bookings>();
        for (const b of beds25Bookings) {
            const checkIn = b.checkIn instanceof Date ? b.checkIn.toISOString().slice(0, 10) : String(b.checkIn).slice(0, 10);
            const checkOut = b.checkOut instanceof Date ? b.checkOut.toISOString().slice(0, 10) : String(b.checkOut).slice(0, 10);
            const key = `${(b.guestName || '').toLowerCase().trim()}|${checkIn}|${checkOut}|${b.room?.roomNumber || ''}`;
            const group = beds25Groups.get(key) || [];
            group.push(b);
            beds25Groups.set(key, group);
        }

        // Find Beds25 duplicates (groups with >1 entry)
        const beds25Duplicates: Array<{
            key: string;
            guest: string;
            dates: string;
            room: string;
            records: Array<{
                id: string;
                zohoId: string | null;
                externalId: string | null;
                status: string;
                verdict: 'KEEP' | 'DELETE';
                reason: string;
            }>;
        }> = [];

        for (const [key, group] of beds25Groups) {
            if (group.length <= 1) continue;
            const [guest, checkIn, checkOut, room] = key.split('|');

            // Decide which to keep: prefer the one with zohoId, then externalId
            const sorted = [...group].sort((a, b) => {
                if (a.zohoId && !b.zohoId) return -1;
                if (!a.zohoId && b.zohoId) return 1;
                if (a.externalId && !b.externalId) return -1;
                if (!a.externalId && b.externalId) return 1;
                return 0;
            });

            beds25Duplicates.push({
                key,
                guest,
                dates: `${checkIn} → ${checkOut}`,
                room,
                records: sorted.map((b, i) => ({
                    id: b.id,
                    zohoId: b.zohoId,
                    externalId: b.externalId,
                    status: b.status,
                    verdict: i === 0 ? 'KEEP' : 'DELETE',
                    reason: i === 0
                        ? `Best linked (zohoId: ${b.zohoId ? '✅' : '❌'}, beds24Id: ${b.externalId ? '✅' : '❌'})`
                        : 'Duplicate — safe to remove',
                })),
            });
        }

        // 3. Fetch ALL Zoho Bookings and group by guest+dates+room
        const allZohoRecords: Array<Record<string, unknown>> = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 10) {
            try {
                const response = await zohoClient.getRecords('Bookings', {
                    fields: ['Booking_Name', 'Guest', 'Check_In', 'Check_Out', 'Room', 'Beds24ID', 'Beds25ID', 'Booking_status', 'Private'],
                    page,
                    per_page: 200,
                });
                if (response.data && response.data.length > 0) {
                    allZohoRecords.push(...response.data);
                    page++;
                    hasMore = response.info?.more_records || false;
                } else {
                    hasMore = false;
                }
            } catch {
                hasMore = false;
            }
        }

        // Build set of zohoIds that Beds25 uses
        const linkedZohoIds = new Set<string>();
        for (const b of beds25Bookings) {
            if (b.zohoId) linkedZohoIds.add(b.zohoId);
        }

        // Group Zoho records by guest+dates+room
        const zohoGroups = new Map<string, Array<Record<string, unknown>>>();
        for (const z of allZohoRecords) {
            const guest = ((z.Guest as { name?: string })?.name || (z.Booking_Name as string) || '').toLowerCase().trim();
            const checkIn = (z.Check_In as string) || '';
            const checkOut = (z.Check_Out as string) || '';
            const room = (z.Room as { name?: string })?.name || (z.Room as string) || '';
            const key = `${guest}|${checkIn}|${checkOut}|${room}`;
            const group = zohoGroups.get(key) || [];
            group.push(z);
            zohoGroups.set(key, group);
        }

        // Find Zoho duplicates
        const zohoDuplicates: Array<{
            guest: string;
            dates: string;
            room: string;
            records: Array<{
                zohoId: string;
                bookingName: string;
                beds24Id: string;
                beds25Id: string;
                status: string;
                isLinkedFromBeds25: boolean;
                verdict: 'KEEP' | 'DELETE';
                reason: string;
            }>;
        }> = [];

        for (const [key, group] of zohoGroups) {
            if (group.length <= 1) continue;
            const [guest, checkIn, checkOut, room] = key.split('|');

            // Sort: linked records first
            const sorted = [...group].sort((a, b) => {
                const aLinked = linkedZohoIds.has(a.id as string) ? 1 : 0;
                const bLinked = linkedZohoIds.has(b.id as string) ? 1 : 0;
                return bLinked - aLinked; // Linked first
            });

            zohoDuplicates.push({
                guest,
                dates: `${checkIn} → ${checkOut}`,
                room,
                records: sorted.map((z, i) => {
                    const isLinked = linkedZohoIds.has(z.id as string);
                    return {
                        zohoId: z.id as string,
                        bookingName: (z.Booking_Name as string) || '',
                        beds24Id: (z.Beds24ID as string) || '',
                        beds25Id: (z.Beds25ID as string) || '',
                        status: (z.Booking_status as string) || '',
                        isLinkedFromBeds25: isLinked,
                        verdict: (isLinked || (i === 0 && !sorted.some(s => linkedZohoIds.has(s.id as string)))) ? 'KEEP' as const : 'DELETE' as const,
                        reason: isLinked
                            ? 'Linked from Beds25 — KEEP'
                            : (i === 0 && !sorted.some(s => linkedZohoIds.has(s.id as string)))
                                ? 'No linked record exists, keeping first entry'
                                : 'Orphan duplicate — safe to delete from Zoho',
                    };
                }),
            });
        }

        return NextResponse.json({
            summary: {
                beds25TotalActive: beds25Bookings.length,
                beds25DuplicateGroups: beds25Duplicates.length,
                zohoTotal: allZohoRecords.length,
                zohoDuplicateGroups: zohoDuplicates.length,
            },
            beds25Duplicates,
            zohoDuplicates,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[DuplicateReport] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
