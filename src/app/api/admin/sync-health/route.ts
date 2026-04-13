import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';
import { fetchBeds24Bookings, getBeds24AccessToken } from '@/lib/beds24';
import { beds24ToBeds25, beds25ToZoho } from '@/lib/status-map';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Fetch Beds25 Local
        const beds25Bookings = await prisma.booking.findMany({
            where: { checkOut: { gte: today } },
            include: { room: true },
            orderBy: { checkIn: 'asc' },
        });
        const activeBookings = beds25Bookings.filter(b => b.status !== 'CANCELLED');

        const issues: Array<{ beds25Id: string, guest: string, dates: string, room: string, issue: string, detail?: string }> = [];

        // 2. Fetch Beds24 Live
        const beds24Map: Map<string, any> = new Map();
        try {
            const property = await prisma.property.findFirst({ where: { beds24RefreshToken: { not: null } } });
            if (property?.beds24RefreshToken) {
                const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);
                const bs = await fetchBeds24Bookings(accessToken);
                for (const b of bs) if (b.id) beds24Map.set(b.id.toString(), b);
            }
        } catch (err) {
            console.warn('[SyncHealth] Could not fetch Beds24', err);
        }

        // 3. Fetch Zoho CRM via COQL
        const zohoMap: Map<string, any> = new Map();
        try {
            const coql = `select id, Check_In, Check_Out, Booking_status, Beds24ID, Beds25ID, Room from Bookings where Check_Out >= '${today.toISOString().slice(0, 10)}'`;
            const zohoRes = await zohoClient.searchRecords(coql);
            if (zohoRes?.data) {
                for (const zb of zohoRes.data) if (zb.id) zohoMap.set(zb.id, zb);
            }
        } catch (err) {
            console.warn('[SyncHealth] COQL Failed, falling back to full getRecords', err);
            // Fallback to basic fetch if COQL fails or Check_Out logic fails
            try {
                const zohoRes = await zohoClient.getRecords('Bookings');
                if (zohoRes?.data) {
                    for (const zb of zohoRes.data) if (zb.id) zohoMap.set(zb.id, zb);
                }
            } catch(e) {
                console.warn('[SyncHealth] getRecords Failed', e);
            }
        }

        // 4. Zoho Duplicates & Missing Room References
        const zohoByBeds24 = new Map<string, any[]>();
        for (const [zId, zb] of zohoMap) {
            const b24Id = zb.Beds24ID || 'manual';
            if (!zohoByBeds24.has(b24Id)) zohoByBeds24.set(b24Id, []);
            zohoByBeds24.get(b24Id)!.push(zb);

            if (!zb.Room || (zb.Room && !zb.Room.id)) {
                issues.push({
                    beds25Id: zb.Beds25ID || 'UNKNOWN_OR_CUID',
                    guest: `Zoho Record ${zId}`,
                    dates: `${zb.Check_In} → ${zb.Check_Out}`,
                    room: 'NONE',
                    issue: 'zoho_missing_room',
                    detail: `Zoho booking ${zId} has NO valid room reference! Likely caused by Beds24 import bug mapping a temporary CUID.`
                });
            }
        }

        let zohoDuplicateCount = 0;
        for (const [b24Id, group] of zohoByBeds24) {
            if (b24Id !== 'manual' && group.length > 1) {
                zohoDuplicateCount += group.length - 1;
                issues.push({
                    beds25Id: 'MULTIPLE',
                    guest: `Beds24 ID: ${b24Id}`,
                    dates: 'N/A',
                    room: 'N/A',
                    issue: 'zoho_duplicate_booking',
                    detail: `Zoho has ${group.length} records for Beds24 ID ${b24Id}: ${group.map(g => g.id).join(', ')}`
                });
            }
        }

        // 5. Cross-Check Active Beds25 -> Zoho & Beds24
        for (const booking of activeBookings) {
            const checkIn = booking.checkIn instanceof Date ? booking.checkIn.toISOString().slice(0, 10) : String(booking.checkIn).slice(0, 10);
            const checkOut = booking.checkOut instanceof Date ? booking.checkOut.toISOString().slice(0, 10) : String(booking.checkOut).slice(0, 10);
            const roomNum = booking.room?.number || booking.roomId;
            const dateRange = `${checkIn} → ${checkOut}`;
            const expectedZohoStatus = beds25ToZoho(booking.status);

            // Zoho Comparison
            if (booking.zohoId) {
                const zb = zohoMap.get(booking.zohoId);
                if (zb) {
                    if (zb.Check_In !== checkIn) {
                        issues.push({ beds25Id: booking.id, guest: booking.guestName, dates: dateRange, room: roomNum, issue: 'zoho_date_mismatch', detail: `Beds25: ${checkIn}, Zoho: ${zb.Check_In}` });
                    }
                    if (zb.Booking_status && zb.Booking_status !== expectedZohoStatus) {
                        issues.push({ beds25Id: booking.id, guest: booking.guestName, dates: dateRange, room: roomNum, issue: 'zoho_status_mismatch', detail: `Beds25: ${expectedZohoStatus}, Zoho: "${zb.Booking_status}"` });
                    }
                } else if (zohoMap.size > 0) { // Only flag not found if Zoho actually fetched records
                    issues.push({ beds25Id: booking.id, guest: booking.guestName, dates: dateRange, room: roomNum, issue: 'zoho_record_not_found', detail: `zohoId ${booking.zohoId} not found in future Zoho bookings` });
                }
            } else if (booking.status !== 'BLOCKED') {
                issues.push({ beds25Id: booking.id, guest: booking.guestName, dates: dateRange, room: roomNum, issue: 'missing_zoho_id', detail: 'No zohoId saved explicitly on this local booking' });
            }

            // Beds24 Comparison
            if (booking.externalId) {
                const b24 = beds24Map.get(booking.externalId);
                if (b24) {
                    const b24Status = beds24ToBeds25(b24.status as string | number);
                    if (b24Status === 'CANCELLED' && booking.status !== 'CANCELLED') {
                        issues.push({ beds25Id: booking.id, guest: booking.guestName, dates: dateRange, room: roomNum, issue: 'beds24_status_mismatch', detail: `Cancelled in Beds24 but ${booking.status} in Beds25` });
                    } else if (b24Status !== 'CANCELLED' && b24Status !== booking.status && booking.status !== 'BLOCKED') {
                        issues.push({ beds25Id: booking.id, guest: booking.guestName, dates: dateRange, room: roomNum, issue: 'beds24_status_mismatch', detail: `Beds25: ${booking.status}, Beds24: ${b24Status}` });
                    }
                } else if (beds24Map.size > 0) {
                    issues.push({ beds25Id: booking.id, guest: booking.guestName, dates: dateRange, room: roomNum, issue: 'beds24_record_not_found', detail: `Beds24 booking ${booking.externalId} missing in Beds24 live data` });
                }
            } else if (booking.status !== 'BLOCKED') {
                issues.push({ beds25Id: booking.id, guest: booking.guestName, dates: dateRange, room: roomNum, issue: 'missing_beds24_id', detail: 'No externalId — local only' });
            }
        }

        // 6. Check for Zoho Orphans (Exists in Zoho, not in Beds25)
        for (const [zId, zb] of zohoMap) {
            const localBooking = beds25Bookings.find(b => b.zohoId === zId || (zb.Beds25ID && b.id === zb.Beds25ID) || (zb.Beds24ID && b.externalId === zb.Beds24ID));
            if (!localBooking && zb.Booking_status !== 'Cancelled') {
                issues.push({ beds25Id: zb.Beds25ID || 'ORPHAN', guest: zb.Beds24ID || 'Manual Entry', dates: `${zb.Check_In} → ${zb.Check_Out}`, room: zb.Room?.name || 'Unknown', issue: 'zoho_orphan', detail: `Booking ${zId} exists in Zoho but is completely missing or unmatched in Beds25!` });
            }
        }

        // 7. Check for Beds24 Orphans (Exists in Beds24, not in Beds25)
        for (const [b24Id, b24] of beds24Map) {
            const localBooking = beds25Bookings.find(b => b.externalId === b24Id);
            const b24Status = beds24ToBeds25(b24.status as string | number);
            if (!localBooking && b24Status !== 'CANCELLED') {
                const guestName = `${b24.firstName || ''} ${b24.lastName || ''}`.trim() || 'Unknown';
                issues.push({ beds25Id: 'MISSING_IN_DB', guest: guestName, dates: `${b24.firstNight || b24.arrival}`, room: `Beds24 Room: ${b24.roomId}`, issue: 'missing_locally', detail: `CRITICAL: Beds24 booking ${b24Id} exists remotely but is missing from Beds25!` });
            }
        }

        const zohoMissing = issues.filter(i => i.issue.startsWith('zoho') || i.issue === 'missing_zoho_id').length;
        const beds24Missing = issues.filter(i => i.issue.startsWith('beds24') || i.issue === 'missing_beds24_id').length;

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            total: activeBookings.length,
            allSynced: issues.length === 0,
            zoho: {
                checked: zohoMap.size,
                ok: activeBookings.length - zohoMissing,
                missing: zohoMissing
            },
            beds24: {
                checked: beds24Map.size,
                ok: activeBookings.length - beds24Missing,
                missing: beds24Missing
            },
            beds24Duplicates: zohoDuplicateCount,
            issueCount: issues.length,
            issues,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
    }
}
