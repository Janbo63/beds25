import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { fetchBeds24Bookings, getBeds24AccessToken } from '@/lib/beds24';
import { bookingService } from '@/lib/zoho-service';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

interface ReconcileResult {
    beds24Id: string;
    guestName: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    status: string;
    action: 'created' | 'updated' | 'skipped' | 'error';
    changes?: string[];
    error?: string;
    zohoSynced?: boolean;
}

/**
 * GET /api/admin/reconcile — Dry-run reconciliation (preview only)
 * POST /api/admin/reconcile — Execute reconciliation
 *   Query params:
 *     syncZoho=true  — also sync missing bookings to Zoho CRM
 */
export async function GET(request: NextRequest) {
    return reconcile(request, true);
}

export async function POST(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    return reconcile(request, dryRun);
}

/**
 * Extract guest name from Beds24 booking, checking all possible field names.
 * Beds24 stores manually-entered names in the `title` field.
 */
function extractGuestName(b: any): string {
    const first = b.firstName || b.guestFirstName || '';
    const last = b.lastName || b.guestLastName || '';
    const combined = `${first} ${last}`.trim();
    if (combined) return combined;

    // Fallback: Beds24 uses 'title' for manually entered bookings
    if (b.title) return b.title;
    if (b.guestName) return b.guestName;
    if (b.name) return b.name;
    if (b.guest) return typeof b.guest === 'string' ? b.guest : '';

    return 'Guest';
}

async function reconcile(request: NextRequest, dryRun: boolean) {
    const { searchParams } = new URL(request.url);
    const syncZoho = searchParams.get('syncZoho') === 'true';
    const debug = searchParams.get('debug') === 'true';

    try {
        // 1. Get Beds24 access token from stored property
        const property = await prisma.property.findFirst({
            where: { beds24RefreshToken: { not: null } },
        });

        if (!property?.beds24RefreshToken) {
            return NextResponse.json(
                { error: 'No Beds24 credentials found. Run initial sync first.' },
                { status: 400 }
            );
        }

        const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);

        // 2. Fetch ALL bookings from Beds24
        const beds24Bookings = await fetchBeds24Bookings(accessToken);

        // 3. Get all local bookings indexed by externalId for fast lookup
        const localBookings = await prisma.booking.findMany({
            where: { externalId: { not: null } },
        });
        const localByExternalId = new Map(
            localBookings.map(b => [b.externalId!, b])
        );

        // 4. Get all rooms indexed by externalId
        const rooms = await prisma.room.findMany();
        const roomByExternalId = new Map(
            rooms.filter(r => r.externalId).map(r => [r.externalId!, r])
        );

        // 5. Status mapping (handles both numeric codes and string values from Beds24)
        const mapStatus = (s: any) => {
            const str = s?.toString().toLowerCase();
            switch (str) {
                case '0': case 'cancelled': return 'CANCELLED';
                case '1': case 'confirmed': return 'CONFIRMED';
                case '2': case 'new': return 'NEW';
                case '3': case 'request': return 'REQUEST';
                case '4': case 'black': case 'blocked': return 'BLOCKED';
                default: return 'CONFIRMED';
            }
        };

        // 6. Reconcile each Beds24 booking
        const results: ReconcileResult[] = [];
        let created = 0, updated = 0, skipped = 0, errors = 0, zohoSynced = 0;

        for (const b of beds24Bookings) {
            const beds24Id = b.id?.toString();
            if (!beds24Id) continue;

            const room = roomByExternalId.get(b.roomId?.toString());
            if (!room) {
                results.push({
                    beds24Id,
                    guestName: extractGuestName(b),
                    roomName: `Unknown (roomId: ${b.roomId})`,
                    checkIn: b.arrival || '',
                    checkOut: b.departure || '',
                    status: mapStatus(b.status),
                    action: 'error',
                    error: `Room with externalId=${b.roomId} not found in local DB`,
                });
                errors++;
                continue;
            }

            const guestName = extractGuestName(b);
            const guestEmail = b.email || null;
            const checkIn = new Date(b.arrival);
            const checkOut = new Date(b.departure);
            const mappedStatus = mapStatus(b.status);
            const totalPrice = parseFloat(b.price || '0');
            const source = b.apiSource || 'BEDS24';
            const numAdults = parseInt(b.numAdult || '1') || 1;
            const numChildren = parseInt(b.numChild || '0') || 0;

            const existing = localByExternalId.get(beds24Id);

            if (existing) {
                // Check for differences
                const changes: string[] = [];
                if (existing.guestName !== guestName) changes.push(`name: "${existing.guestName}" → "${guestName}"`);
                if ((existing.guestEmail || null) !== guestEmail) changes.push(`email: "${existing.guestEmail || ''}" → "${guestEmail || ''}"`);
                if (format(existing.checkIn, 'yyyy-MM-dd') !== format(checkIn, 'yyyy-MM-dd')) changes.push(`checkIn: ${format(existing.checkIn, 'yyyy-MM-dd')} → ${format(checkIn, 'yyyy-MM-dd')}`);
                if (format(existing.checkOut, 'yyyy-MM-dd') !== format(checkOut, 'yyyy-MM-dd')) changes.push(`checkOut: ${format(existing.checkOut, 'yyyy-MM-dd')} → ${format(checkOut, 'yyyy-MM-dd')}`);
                if (existing.status !== mappedStatus) changes.push(`status: ${existing.status} → ${mappedStatus}`);
                if (Math.abs(existing.totalPrice - totalPrice) > 0.01) changes.push(`price: ${existing.totalPrice} → ${totalPrice}`);
                if (existing.roomId !== room.id) changes.push(`room: moved to ${room.name}`);

                if (changes.length === 0) {
                    results.push({
                        beds24Id, guestName, roomName: room.name || room.number || '',
                        checkIn: format(checkIn, 'yyyy-MM-dd'),
                        checkOut: format(checkOut, 'yyyy-MM-dd'),
                        status: mappedStatus, action: 'skipped',
                    });
                    skipped++;
                } else {
                    // Has changes — update
                    let didZohoSync = false;
                    if (!dryRun) {
                        const updatedBooking = await prisma.booking.update({
                            where: { id: existing.id },
                            data: {
                                guestName, guestEmail, checkIn, checkOut,
                                status: mappedStatus, totalPrice, source,
                                numAdults, numChildren, roomId: room.id,
                            },
                        });

                        // Also sync updates to Zoho
                        if (syncZoho) {
                            try {
                                await bookingService.syncToZoho(updatedBooking, room);
                                didZohoSync = true;
                                zohoSynced++;
                            } catch (err: any) {
                                console.error(`[Reconcile] Zoho update sync failed for ${beds24Id}:`, err?.message);
                            }
                        }
                    }
                    results.push({
                        beds24Id, guestName, roomName: room.name || room.number || '',
                        checkIn: format(checkIn, 'yyyy-MM-dd'),
                        checkOut: format(checkOut, 'yyyy-MM-dd'),
                        status: mappedStatus, action: 'updated', changes,
                        zohoSynced: syncZoho ? didZohoSync : undefined,
                    });
                    updated++;
                }
            } else {
                // New booking — create in Beds25 DB
                let didZohoSync = false;

                if (!dryRun) {
                    // Upsert guest if email exists
                    let guestId: string | null = null;
                    if (guestEmail) {
                        const guest = await prisma.guest.upsert({
                            where: { email: guestEmail },
                            update: { name: guestName, phone: b.phone || b.mobile || null },
                            create: { name: guestName, email: guestEmail, phone: b.phone || b.mobile || null },
                        });
                        guestId = guest.id;
                    }

                    const newBooking = await prisma.booking.create({
                        data: {
                            roomId: room.id, guestName, guestEmail, guestId,
                            checkIn, checkOut, status: mappedStatus,
                            source, totalPrice, numAdults, numChildren,
                            externalId: beds24Id,
                            notes: 'Created by reconciliation tool',
                        },
                    });

                    // Optionally sync to Zoho
                    if (syncZoho) {
                        try {
                            await bookingService.syncToZoho(newBooking, room);
                            didZohoSync = true;
                            zohoSynced++;
                        } catch (err: any) {
                            console.error(`[Reconcile] Zoho sync failed for ${beds24Id}:`, err?.message);
                        }
                    }
                }

                results.push({
                    beds24Id, guestName, roomName: room.name || room.number || '',
                    checkIn: format(checkIn, 'yyyy-MM-dd'),
                    checkOut: format(checkOut, 'yyyy-MM-dd'),
                    status: mappedStatus, action: 'created',
                    ...(debug && guestName === 'Guest' ? { rawBeds24Fields: Object.keys(b).reduce((acc: any, key: string) => { if (b[key]) acc[key] = b[key]; return acc; }, {}) } : {}),
                    zohoSynced: syncZoho ? didZohoSync : undefined,
                });
                created++;
            }
        }

        // Also check for local bookings with externalIds that don't exist in Beds24
        const beds24Ids = new Set(beds24Bookings.map((b: any) => b.id?.toString()));
        const orphanedLocal = localBookings.filter(lb => lb.externalId && !beds24Ids.has(lb.externalId));

        return NextResponse.json({
            dryRun,
            syncZoho,
            summary: {
                beds24Total: beds24Bookings.length,
                created,
                updated,
                skipped,
                errors,
                zohoSynced,
                orphanedInLocal: orphanedLocal.length,
            },
            orphanedBookings: orphanedLocal.map(ob => ({
                id: ob.id,
                externalId: ob.externalId,
                guestName: ob.guestName,
                checkIn: format(ob.checkIn, 'yyyy-MM-dd'),
                checkOut: format(ob.checkOut, 'yyyy-MM-dd'),
                status: ob.status,
                note: 'Exists in Beds25 but NOT in Beds24 (may have been deleted in Beds24)',
            })),
            details: results,
        });
    } catch (error: any) {
        console.error('[Reconcile] Error:', error);
        return NextResponse.json(
            { error: 'Reconciliation failed', message: error?.message },
            { status: 500 }
        );
    }
}
