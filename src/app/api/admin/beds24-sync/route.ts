import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { importBeds24Data } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

/**
 * Full Sync: Beds24 → Beds25 → Zoho
 * 
 * Makes Beds24 the single source of truth.
 * 
 * GET  → Preview: show current booking counts and what will happen
 * POST → Execute: optionally clear old bookings, then re-import everything from Beds24
 * 
 * POST body:
 *   { "clearExisting": true }   — delete all local bookings first, then import fresh
 *   { "clearExisting": false }  — upsert only (merge/update existing, add new)
 *   { "confirm": true }         — required safety flag
 */
export async function GET() {
    const [localBookings, rooms, properties, webhookLogs] = await Promise.all([
        prisma.booking.findMany({
            select: { id: true, guestName: true, externalId: true, status: true, source: true, checkIn: true, checkOut: true, room: { select: { name: true, number: true, externalId: true } } },
            orderBy: { checkIn: 'asc' }
        }),
        prisma.room.findMany({
            select: { id: true, name: true, number: true, externalId: true }
        }),
        prisma.property.findMany({
            select: { id: true, name: true, externalId: true, beds24InviteCode: true }
        }),
        prisma.webhookLog.count()
    ]);

    const hasBeds24Credentials = properties.some(p => p.beds24InviteCode);

    return NextResponse.json({
        status: 'preview',
        message: 'Send POST with { "clearExisting": true, "confirm": true } to wipe and re-import, or { "clearExisting": false, "confirm": true } to merge/upsert.',
        currentState: {
            totalBookings: localBookings.length,
            bookingsByStatus: localBookings.reduce((acc, b) => {
                acc[b.status] = (acc[b.status] || 0) + 1;
                return acc;
            }, {} as Record<string, number>),
            bookingsWithExternalId: localBookings.filter(b => b.externalId).length,
            bookingsWithoutExternalId: localBookings.filter(b => !b.externalId).length,
            rooms: rooms.map(r => ({
                name: r.name,
                number: r.number,
                beds24Id: r.externalId,
                mapped: !!r.externalId
            })),
            unmappedRooms: rooms.filter(r => !r.externalId).length,
            properties: properties.map(p => ({
                name: p.name,
                beds24Id: p.externalId,
                hasCredentials: !!p.beds24InviteCode
            })),
            webhookLogCount: webhookLogs,
            hasBeds24Credentials,
        },
        bookings: localBookings.map(b => ({
            id: b.id,
            guest: b.guestName,
            externalId: b.externalId,
            status: b.status,
            source: b.source,
            room: b.room?.name || b.room?.number,
            checkIn: b.checkIn,
            checkOut: b.checkOut,
        }))
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clearExisting = false, confirm = false } = body;

        if (!confirm) {
            return NextResponse.json({
                error: 'Safety check: set "confirm": true in the request body to proceed.',
                hint: 'GET this endpoint first to preview what will happen.'
            }, { status: 400 });
        }

        // Find a property with Beds24 credentials
        const property = await prisma.property.findFirst({
            where: { beds24InviteCode: { not: null } }
        });

        if (!property?.beds24InviteCode) {
            return NextResponse.json({
                error: 'No property with Beds24 credentials found. Run the Beds24 import first.'
            }, { status: 400 });
        }

        const results: Record<string, any> = {
            startedAt: new Date().toISOString(),
            clearExisting,
        };

        // Step 1: Optionally clear existing bookings
        if (clearExisting) {
            const deletedBookings = await prisma.booking.deleteMany({});
            const deletedGuests = await prisma.guest.deleteMany({});
            const deletedLogs = await prisma.webhookLog.deleteMany({});
            results.cleaned = {
                bookingsDeleted: deletedBookings.count,
                guestsDeleted: deletedGuests.count,
                webhookLogsDeleted: deletedLogs.count,
            };
        }

        // Step 2: Full import from Beds24
        const importResult = await importBeds24Data(property.beds24InviteCode);
        results.import = importResult;

        // Step 3: Count final state
        const finalBookings = await prisma.booking.count();
        const finalGuests = await prisma.guest.count();
        results.finalState = {
            totalBookings: finalBookings,
            totalGuests: finalGuests,
        };

        results.completedAt = new Date().toISOString();

        // Log the sync event
        await prisma.webhookLog.create({
            data: {
                direction: 'INCOMING',
                source: 'BEDS24',
                event: 'FULL_SYNC',
                status: 'SUCCESS',
                metadata: JSON.stringify(results),
            }
        }).catch(() => { });

        return NextResponse.json({
            success: true,
            message: clearExisting
                ? 'Cleared all existing bookings and re-imported from Beds24'
                : 'Merged/upserted bookings from Beds24',
            results
        });
    } catch (error: any) {
        // Log failure
        await prisma.webhookLog.create({
            data: {
                direction: 'INCOMING',
                source: 'BEDS24',
                event: 'FULL_SYNC',
                status: 'ERROR',
                error: error?.message || 'Unknown error',
            }
        }).catch(() => { });

        return NextResponse.json({
            error: 'Full sync failed',
            message: error?.message || 'Unknown error'
        }, { status: 500 });
    }
}
