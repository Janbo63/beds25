import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/zoho-cleanup
 * Read-only audit: cross-references Beds25 bookings against Zoho Bookings
 * to identify orphan records (not linked from any Beds25 booking).
 * 
 * POST /api/admin/zoho-cleanup
 * Requires explicit list of Zoho IDs + confirm=true to delete orphans.
 * Also re-syncs statuses for all linked bookings.
 */
export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const action = url.searchParams.get('action');
        const confirm = url.searchParams.get('confirm') === 'true';

        // 1. Get ALL Beds25 bookings and their zohoIds
        const beds25Bookings = await prisma.booking.findMany({
            select: { id: true, zohoId: true, guestName: true, status: true, checkIn: true, checkOut: true, externalId: true },
        });

        // Build a set of zohoIds that Beds25 is actively using
        const linkedZohoIds = new Set<string>();
        const beds25ByZohoId = new Map<string, typeof beds25Bookings[0]>();
        for (const b of beds25Bookings) {
            if (b.zohoId) {
                linkedZohoIds.add(b.zohoId);
                beds25ByZohoId.set(b.zohoId, b);
            }
        }

        // 2. Fetch ALL Zoho Bookings (paginated)
        const allZohoRecords: Array<Record<string, unknown>> = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 10) { // Safety cap at 10 pages
            try {
                const response = await zohoClient.getRecords('Bookings', {
                    fields: ['Booking_Name', 'Guest', 'Check_In', 'Check_Out', 'Room', 'Beds24ID', 'Beds25ID', 'Booking_status'],
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

        // 3. Classify each Zoho record
        const report: Array<{
            zohoId: string;
            bookingName: string;
            guest: string;
            checkIn: string;
            checkOut: string;
            room: string;
            beds24Id: string;
            beds25Id: string;
            zohoStatus: string;
            verdict: 'KEEP' | 'ORPHAN' | 'STATUS_FIX';
            reason: string;
            beds25Status?: string;
        }> = [];

        for (const z of allZohoRecords) {
            const zohoId = z.id as string;
            const bookingName = (z.Booking_Name as string) || '';
            const guest = (z.Guest as { name?: string })?.name || '';
            const checkIn = (z.Check_In as string) || '';
            const checkOut = (z.Check_Out as string) || '';
            const room = (z.Room as { name?: string })?.name || (z.Room as string) || '';
            const beds24Id = (z.Beds24ID as string) || '';
            const beds25Id = (z.Beds25ID as string) || '';
            const zohoStatus = (z.Booking_status as string) || '';

            const isLinked = linkedZohoIds.has(zohoId);
            const linkedBooking = isLinked ? beds25ByZohoId.get(zohoId) : null;

            let verdict: 'KEEP' | 'ORPHAN' | 'STATUS_FIX' = 'KEEP';
            let reason = '';

            if (isLinked) {
                if (linkedBooking && zohoStatus.toUpperCase() !== linkedBooking.status) {
                    verdict = 'STATUS_FIX';
                    reason = `Linked to Beds25 booking "${linkedBooking.guestName}" but status differs: Zoho=${zohoStatus}, Beds25=${linkedBooking.status}`;
                } else {
                    verdict = 'KEEP';
                    reason = `Linked to Beds25 booking "${linkedBooking?.guestName || 'unknown'}"`;
                }
            } else {
                verdict = 'ORPHAN';
                reason = 'Not linked from any Beds25 booking';
            }

            report.push({
                zohoId, bookingName, guest, checkIn, checkOut, room,
                beds24Id, beds25Id, zohoStatus, verdict, reason,
                beds25Status: linkedBooking?.status,
            });
        }

        const orphans = report.filter(r => r.verdict === 'ORPHAN');
        const keepCount = report.filter(r => r.verdict === 'KEEP').length;
        const statusFixCount = report.filter(r => r.verdict === 'STATUS_FIX').length;

        // AUTO-DELETE ORPHANS if requested
        if (action === 'delete_all_orphans' && confirm && orphans.length > 0) {
            const deleteResults = { deleted: 0, failed: 0, errors: [] as string[] };
            
            for (const orphan of orphans) {
                try {
                    await zohoClient.deleteRecord('Bookings', orphan.zohoId);
                    deleteResults.deleted++;
                } catch (err: unknown) {
                    deleteResults.failed++;
                    const msg = err instanceof Error ? err.message : 'Unknown';
                    deleteResults.errors.push(`${orphan.zohoId} (${orphan.guest || orphan.bookingName}): ${msg}`);
                }
            }

            return NextResponse.json({
                action: 'delete_all_orphans',
                summary: {
                    totalZoho: allZohoRecords.length,
                    totalBeds25: beds25Bookings.length,
                    orphansFound: orphans.length,
                    deleted: deleteResults.deleted,
                    failed: deleteResults.failed,
                    kept: keepCount + statusFixCount,
                },
                errors: deleteResults.errors,
            });
        }

        return NextResponse.json({
            summary: {
                totalZoho: allZohoRecords.length,
                totalBeds25: beds25Bookings.length,
                linked: keepCount + statusFixCount,
                orphans: orphans.length,
                statusFixes: statusFixCount,
            },
            ...(action !== 'delete_all_orphans' ? {
                hint: 'Add ?action=delete_all_orphans&confirm=true to delete all orphans',
            } : {}),
            report: report.sort((a, b) => {
                const order = { ORPHAN: 0, STATUS_FIX: 1, KEEP: 2 };
                return order[a.verdict] - order[b.verdict];
            }),
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[ZohoCleanup] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * POST: Delete specific orphan Zoho records AND fix statuses for linked ones.
 * Requires: { action: "delete_orphans" | "fix_statuses" | "both", confirm: true }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, confirm, orphanIds } = body;

        if (!confirm) {
            return NextResponse.json({ error: 'You must pass confirm: true to proceed. This is destructive.' }, { status: 400 });
        }

        const results = { deleted: 0, statusFixed: 0, errors: [] as string[] };

        if ((action === 'delete_orphans' || action === 'both') && orphanIds?.length > 0) {
            for (const zohoId of orphanIds) {
                try {
                    await zohoClient.deleteRecord('Bookings', zohoId);
                    results.deleted++;
                    console.log(`[ZohoCleanup] Deleted orphan ${zohoId}`);
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Unknown';
                    results.errors.push(`Failed to delete ${zohoId}: ${msg}`);
                }
            }
        }

        if (action === 'fix_statuses' || action === 'both') {
            // Re-sync all Beds25 bookings that have a zohoId
            const bookings = await prisma.booking.findMany({
                where: { zohoId: { not: null } },
                include: { room: true },
            });

            const { bookingService } = await import('@/lib/zoho-service');
            for (const booking of bookings) {
                if (booking.room) {
                    try {
                        await bookingService.syncToZoho(booking, booking.room);
                        results.statusFixed++;
                    } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : 'Unknown';
                        results.errors.push(`Failed to sync ${booking.guestName}: ${msg}`);
                    }
                }
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
