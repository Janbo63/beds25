import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';
import { fetchBeds24Bookings, getBeds24AccessToken } from '@/lib/beds24';
import { beds24ToBeds25, beds25ToZoho } from '@/lib/status-map';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/sync-health
 * Compare bookings across Beds25, Zoho, and Beds24 from today forward.
 * Now actually queries the Beds24 API for live status comparison.
 */
export async function GET() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Get all Beds25 bookings from today forward (including CANCELLED for cross-check)
        const beds25Bookings = await prisma.booking.findMany({
            where: {
                checkOut: { gte: today },
            },
            include: { room: true },
            orderBy: { checkIn: 'asc' },
        });

        // Filter active bookings for display (non-cancelled)
        const activeBookings = beds25Bookings.filter(b => b.status !== 'CANCELLED');

        const issues: Array<{
            beds25Id: string;
            guest: string;
            dates: string;
            room: string;
            issue: string;
            detail?: string;
        }> = [];

        // 2. Fetch ALL Beds24 bookings once (instead of per-booking queries)
        const beds24Map: Map<string, Record<string, unknown>> = new Map();
        try {
            const property = await prisma.property.findFirst({
                where: { beds24RefreshToken: { not: null } }
            });
            if (property?.beds24RefreshToken) {
                const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);
                const beds24Bookings = await fetchBeds24Bookings(accessToken);
                for (const b of beds24Bookings) {
                    if (b.id) beds24Map.set(b.id.toString(), b);
                }
                console.log(`[SyncHealth] Loaded ${beds24Map.size} Beds24 bookings for comparison`);
            }
        } catch (err) {
            console.warn('[SyncHealth] Could not fetch Beds24 bookings:', err);
        }

        // 3. Check each active booking against Zoho and Beds24
        let zohoChecked = 0;
        let zohoOk = 0;
        let beds24Checked = 0;
        let beds24Ok = 0;

        // Map Beds24 numeric status using shared utility
        const mapBeds24Status = beds24ToBeds25;

        for (const booking of activeBookings) {
            const checkIn = booking.checkIn instanceof Date ? booking.checkIn.toISOString().slice(0, 10) : String(booking.checkIn).slice(0, 10);
            const checkOut = booking.checkOut instanceof Date ? booking.checkOut.toISOString().slice(0, 10) : String(booking.checkOut).slice(0, 10);
            const roomNum = booking.room?.number || booking.roomId;
            const dateRange = `${checkIn} → ${checkOut}`;

            // ── Check Zoho ──
            if (booking.zohoId) {
                zohoChecked++;
                try {
                    const zohoRecord = await zohoClient.getRecord('Bookings', booking.zohoId);
                    if (zohoRecord) {
                        const zohoCheckIn = zohoRecord.Check_In;
                        const zohoStatus = zohoRecord.Booking_status;

                        if (zohoCheckIn !== checkIn) {
                            issues.push({
                                beds25Id: booking.id, guest: booking.guestName,
                                dates: dateRange, room: roomNum,
                                issue: 'zoho_date_mismatch',
                                detail: `Beds25: ${checkIn}, Zoho: ${zohoCheckIn}`,
                            });
                        } else {
                            zohoOk++;
                        }

                        // Compare status using the shared mapping
                        const expectedZohoStatus = beds25ToZoho(booking.status);
                        if (zohoStatus && zohoStatus !== expectedZohoStatus) {
                            issues.push({
                                beds25Id: booking.id, guest: booking.guestName,
                                dates: dateRange, room: roomNum,
                                issue: 'zoho_status_mismatch',
                                detail: `Beds25: ${booking.status} (→ "${expectedZohoStatus}"), Zoho: "${zohoStatus}"`,
                            });
                        }
                    } else {
                        issues.push({
                            beds25Id: booking.id, guest: booking.guestName,
                            dates: dateRange, room: roomNum,
                            issue: 'zoho_record_not_found',
                            detail: `zohoId ${booking.zohoId} not found in Zoho`,
                        });
                    }
                } catch {
                    issues.push({
                        beds25Id: booking.id, guest: booking.guestName,
                        dates: dateRange, room: roomNum,
                        issue: 'zoho_fetch_error',
                        detail: `Failed to fetch zohoId ${booking.zohoId}`,
                    });
                }
            } else if (booking.status !== 'BLOCKED') {
                issues.push({
                    beds25Id: booking.id, guest: booking.guestName,
                    dates: dateRange, room: roomNum,
                    issue: 'missing_zoho_id',
                    detail: 'No zohoId — booking not synced to Zoho',
                });
            }

            // ── Check Beds24 (LIVE status comparison) ──
            if (booking.externalId) {
                beds24Checked++;
                const beds24Booking = beds24Map.get(booking.externalId);
                if (beds24Booking) {
                    const beds24Status = mapBeds24Status(beds24Booking.status as string | number);
                    
                    // Check if Beds24 shows cancelled but Beds25 doesn't
                    if (beds24Status === 'CANCELLED' && booking.status !== 'CANCELLED') {
                        issues.push({
                            beds25Id: booking.id, guest: booking.guestName,
                            dates: dateRange, room: roomNum,
                            issue: 'beds24_status_mismatch',
                            detail: `Cancelled in Beds24 but ${booking.status} in Beds25 — channel cancellation not propagated`,
                        });
                    } else if (beds24Status !== 'CANCELLED' && beds24Status !== booking.status && booking.status !== 'BLOCKED') {
                        issues.push({
                            beds25Id: booking.id, guest: booking.guestName,
                            dates: dateRange, room: roomNum,
                            issue: 'beds24_status_mismatch',
                            detail: `Beds25: ${booking.status}, Beds24: ${beds24Status}`,
                        });
                    } else {
                        beds24Ok++;
                    }
                } else {
                    // externalId exists but booking not found in Beds24 — it might have been deleted
                    issues.push({
                        beds25Id: booking.id, guest: booking.guestName,
                        dates: dateRange, room: roomNum,
                        issue: 'beds24_record_not_found',
                        detail: `Beds24 booking ${booking.externalId} not found — may have been deleted`,
                    });
                }
            } else if (booking.status !== 'BLOCKED') {
                issues.push({
                    beds25Id: booking.id, guest: booking.guestName,
                    dates: dateRange, room: roomNum,
                    issue: 'missing_beds24_id',
                    detail: 'No externalId — not synced to Beds24 (channel availability gap)',
                });
            }
        }

        // 4. Check for missing bookings (Beds24 has it, Beds25 does not)
        for (const [beds24Id, b24] of beds24Map) {
            const localBooking = beds25Bookings.find(b => b.externalId === beds24Id);
            const b24StatusStr = b24.status as string | number;
            const statusMapped = mapBeds24Status(b24StatusStr);
            
            if (!localBooking) {
                // Ignore if it's explicitly cancelled in Beds24
                if (statusMapped !== 'CANCELLED') {
                    const guestName = `${b24.firstName || ''} ${b24.lastName || ''}`.trim() || 'Unknown';
                    const arrival = b24.firstNight || b24.arrival || 'Unknown';
                    const dateRange = `${arrival} (Beds24)`;
                    
                    issues.push({
                        beds25Id: 'MISSING_IN_DB',
                        guest: guestName,
                        dates: dateRange,
                        room: `Beds24 Room ID: ${b24.roomId || 'Unknown'}`,
                        issue: 'missing_locally',
                        detail: `CRITICAL: Beds24 booking ${beds24Id} exists remotely but is completely missing from Beds25!`,
                    });
                }
            }
        }

        // 5. Check for duplicate Beds24 entries (multiple Beds24 bookings pointing to same room+dates)
        const beds24ByRoomDate = new Map<string, any[]>();
        for (const [, b24] of beds24Map) {
            const key = `${b24.roomId}-${b24.firstNight || b24.arrival}`;
            if (!beds24ByRoomDate.has(key)) beds24ByRoomDate.set(key, []);
            beds24ByRoomDate.get(key)!.push(b24);
        }
        let duplicateCount = 0;
        for (const [, group] of beds24ByRoomDate) {
            if (group.length > 1) {
                duplicateCount += group.length - 1;
            }
        }

        const allSynced = issues.length === 0;

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            total: activeBookings.length,
            allSynced,
            zoho: { checked: zohoChecked, ok: zohoOk, missing: activeBookings.length - zohoChecked },
            beds24: { checked: beds24Checked, ok: beds24Ok, missing: activeBookings.length - beds24Checked },
            beds24Duplicates: duplicateCount,
            issueCount: issues.length,
            issues,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[SyncHealth] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
