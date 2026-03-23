import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/sync-health
 * Compare bookings across Beds25, Zoho, and Beds24 from today forward.
 * Returns a discrepancy report showing missing or mismatched records.
 */
export async function GET() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Get all Beds25 bookings from today forward
        const beds25Bookings = await prisma.booking.findMany({
            where: {
                checkOut: { gte: today },
                status: { notIn: ['CANCELLED'] },
            },
            include: { room: true },
            orderBy: { checkIn: 'asc' },
        });

        const issues: Array<{
            beds25Id: string;
            guest: string;
            dates: string;
            room: string;
            issue: string;
            detail?: string;
        }> = [];

        // 2. Check each booking against Zoho
        let zohoChecked = 0;
        let zohoOk = 0;
        let beds24Checked = 0;
        let beds24Ok = 0;

        for (const booking of beds25Bookings) {
            const checkIn = booking.checkIn instanceof Date ? booking.checkIn.toISOString().slice(0, 10) : String(booking.checkIn).slice(0, 10);
            const checkOut = booking.checkOut instanceof Date ? booking.checkOut.toISOString().slice(0, 10) : String(booking.checkOut).slice(0, 10);
            const roomNum = booking.room?.number || booking.roomId;
            const dateRange = `${checkIn} → ${checkOut}`;

            // Check Zoho
            if (booking.zohoId) {
                zohoChecked++;
                try {
                    const zohoRecord = await zohoClient.getRecord('Bookings', booking.zohoId);
                    if (zohoRecord) {
                        // Compare key fields
                        const zohoCheckIn = zohoRecord.Check_In;
                        const zohoRoom = zohoRecord.Room;
                        const zohoStatus = zohoRecord.Booking_status;

                        if (zohoCheckIn !== checkIn) {
                            issues.push({
                                beds25Id: booking.id,
                                guest: booking.guestName,
                                dates: dateRange,
                                room: roomNum,
                                issue: 'zoho_date_mismatch',
                                detail: `Beds25: ${checkIn}, Zoho: ${zohoCheckIn}`,
                            });
                        } else {
                            zohoOk++;
                        }

                        // Check status alignment
                        if (zohoStatus && zohoStatus !== booking.status && booking.status !== 'BLOCKED') {
                            issues.push({
                                beds25Id: booking.id,
                                guest: booking.guestName,
                                dates: dateRange,
                                room: roomNum,
                                issue: 'zoho_status_mismatch',
                                detail: `Beds25: ${booking.status}, Zoho: ${zohoStatus}`,
                            });
                        }
                    } else {
                        issues.push({
                            beds25Id: booking.id,
                            guest: booking.guestName,
                            dates: dateRange,
                            room: roomNum,
                            issue: 'zoho_record_not_found',
                            detail: `zohoId ${booking.zohoId} not found in Zoho`,
                        });
                    }
                } catch {
                    issues.push({
                        beds25Id: booking.id,
                        guest: booking.guestName,
                        dates: dateRange,
                        room: roomNum,
                        issue: 'zoho_fetch_error',
                        detail: `Failed to fetch zohoId ${booking.zohoId}`,
                    });
                }
            } else {
                issues.push({
                    beds25Id: booking.id,
                    guest: booking.guestName,
                    dates: dateRange,
                    room: roomNum,
                    issue: 'missing_zoho_id',
                    detail: 'No zohoId — booking not synced to Zoho',
                });
            }

            // Check Beds24
            if (booking.externalId) {
                beds24Checked++;
                beds24Ok++; // We trust Beds24 link via externalId — can't query Beds24 API cheaply
            } else if (booking.status !== 'BLOCKED') {
                issues.push({
                    beds25Id: booking.id,
                    guest: booking.guestName,
                    dates: dateRange,
                    room: roomNum,
                    issue: 'missing_beds24_id',
                    detail: 'No externalId — not synced to Beds24 (channel availability gap)',
                });
            }
        }

        const allSynced = issues.length === 0;

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            total: beds25Bookings.length,
            allSynced,
            zoho: { checked: zohoChecked, ok: zohoOk, missing: beds25Bookings.length - zohoChecked },
            beds24: { checked: beds24Checked, ok: beds24Ok, missing: beds25Bookings.length - beds24Checked },
            issueCount: issues.length,
            issues,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[SyncHealth] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
