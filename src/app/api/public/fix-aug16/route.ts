import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * ONE-TIME data fix for Aug 16 sync issues:
 * 1. Fix Room links on 4 Zoho bookings with missing rooms
 * 2. Delete duplicate Zoho records
 * 3. Re-sync Kamila's status to Zoho
 * 
 * GET /api/public/fix-aug16?key=beds25-aug16-fix → audit
 * GET /api/public/fix-aug16?key=beds25-aug16-fix&fix=true → apply
 */
export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-aug16-fix') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    const results: any[] = [];

    // ═══════════════════════════════════════════════════════════
    // 1. Fix Room links on Zoho bookings
    // ═══════════════════════════════════════════════════════════
    const zohoIdsNeedingRoom = [
        '884394000001886001',
        '884394000001950002',
        '884394000001951001',
        '884394000001980001',
    ];

    // Build room lookup: Zoho Room ID -> Room
    const rooms = await prisma.room.findMany();
    const zohoRoomMap = new Map<string, any>();
    for (const r of rooms) {
        if (/^\d{15,}$/.test(r.id)) {
            zohoRoomMap.set(r.id, r);
        }
    }

    for (const zohoId of zohoIdsNeedingRoom) {
        try {
            const zohoRecord = await zohoClient.getRecord('Bookings', zohoId);
            if (!zohoRecord) {
                results.push({ zohoId, action: 'SKIP', reason: 'Zoho record not found' });
                continue;
            }

            // Find the matching local booking
            const localBooking = await prisma.booking.findFirst({
                where: {
                    OR: [
                        { zohoId },
                        ...(zohoRecord.Beds25ID ? [{ id: zohoRecord.Beds25ID }] : []),
                        ...(zohoRecord.Beds24ID ? [{ externalId: zohoRecord.Beds24ID }] : []),
                    ],
                },
                include: { room: true },
            });

            if (!localBooking?.room) {
                results.push({ zohoId, action: 'SKIP', reason: 'No matching local booking or room' });
                continue;
            }

            // Resolve the room's Zoho ID
            let roomZohoId: string | undefined;
            if (/^\d{15,}$/.test(localBooking.room.id)) {
                roomZohoId = localBooking.room.id;
            } else if (localBooking.room.externalId) {
                // Search Zoho Rooms by Beds24 Room ID
                try {
                    const searchResult = await zohoClient.searchRecords(
                        `select id from Rooms where Beds24_Room_ID = '${localBooking.room.externalId}'`
                    );
                    if (searchResult.data?.length > 0) {
                        roomZohoId = searchResult.data[0].id;
                    }
                } catch { /* fall through */ }
            }

            const result: any = {
                zohoId,
                guest: zohoRecord.Guest_Name || zohoRecord.Name,
                dates: `${zohoRecord.Check_In} → ${zohoRecord.Check_Out}`,
                localRoom: localBooking.room.name,
                roomZohoId: roomZohoId || 'UNRESOLVED',
                currentRoomInZoho: zohoRecord.Room?.id || 'NONE',
            };

            if (applyFix && roomZohoId) {
                await zohoClient.updateRecord('Bookings', zohoId, {
                    Room: { id: roomZohoId },
                });
                result.action = 'FIXED_ROOM';
            } else {
                result.action = applyFix ? 'SKIP_NO_ROOM_ID' : 'AUDIT_ONLY';
            }

            results.push(result);
        } catch (err: any) {
            results.push({ zohoId, action: 'ERROR', error: err.message });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. Handle Zoho Duplicates
    // ═══════════════════════════════════════════════════════════
    const duplicates = [
        {
            beds24Id: '83495506',
            zohoIds: ['884394000001177031', '884394000001996001'],
        },
        {
            beds24Id: '90372348',
            zohoIds: ['884394000001915001', '884394000001950002', '884394000001951001'],
        },
    ];

    for (const dup of duplicates) {
        // Find which Zoho record is linked to the local booking
        const localBooking = await prisma.booking.findFirst({
            where: { externalId: dup.beds24Id },
        });

        const linkedZohoId = localBooking?.zohoId;

        // Fetch all Zoho records to compare completeness
        const records: any[] = [];
        for (const zId of dup.zohoIds) {
            try {
                const zr = await zohoClient.getRecord('Bookings', zId);
                records.push({
                    id: zId,
                    isLinked: zId === linkedZohoId,
                    hasRoom: !!zr?.Room?.id,
                    hasGuest: !!zr?.Guest?.id,
                    status: zr?.Booking_status,
                    beds25Id: zr?.Beds25ID,
                    checkIn: zr?.Check_In,
                });
            } catch {
                records.push({ id: zId, error: 'fetch failed' });
            }
        }

        // Keep the linked one, or the most complete one
        const keep = records.find(r => r.isLinked) || records.find(r => r.hasRoom && r.hasGuest) || records[0];
        const toDelete = records.filter(r => r.id !== keep.id);

        const dupResult: any = {
            beds24Id: dup.beds24Id,
            localBookingId: localBooking?.id,
            linkedZohoId,
            records,
            keep: keep.id,
            delete: toDelete.map(r => r.id),
        };

        if (applyFix) {
            for (const del of toDelete) {
                try {
                    await zohoClient.deleteRecord('Bookings', del.id);
                    del.deleted = true;
                } catch (err: any) {
                    del.deleteError = err.message;
                }
            }

            // Ensure the kept record is linked to the local booking
            if (localBooking && keep.id !== linkedZohoId) {
                await prisma.booking.update({
                    where: { id: localBooking.id },
                    data: { zohoId: keep.id },
                });
                dupResult.relinked = true;
            }

            dupResult.action = 'DUPLICATES_CLEANED';
        } else {
            dupResult.action = 'AUDIT_ONLY';
        }

        results.push(dupResult);
    }

    // ═══════════════════════════════════════════════════════════
    // 3. Re-sync Kamila's status to Zoho
    // ═══════════════════════════════════════════════════════════
    const kamilaBooking = await prisma.booking.findFirst({
        where: { guestName: { contains: 'Kamila' }, status: 'DEPOSIT_PAID' },
        include: { room: true },
    });

    if (kamilaBooking) {
        const kamilaResult: any = {
            guest: kamilaBooking.guestName,
            localStatus: kamilaBooking.status,
            zohoId: kamilaBooking.zohoId,
        };

        if (applyFix && kamilaBooking.zohoId) {
            try {
                await zohoClient.updateRecord('Bookings', kamilaBooking.zohoId, {
                    Booking_status: 'Deposit Paid',
                });
                kamilaResult.action = 'STATUS_SYNCED';
            } catch (err: any) {
                kamilaResult.action = 'ERROR';
                kamilaResult.error = err.message;
            }
        } else {
            kamilaResult.action = 'AUDIT_ONLY';
        }

        results.push(kamilaResult);
    }

    // ═══════════════════════════════════════════════════════════
    // 4. Fix source='BEDS24' on existing bookings
    // ═══════════════════════════════════════════════════════════
    const { mapChannelSource } = await import('@/lib/status-map');

    const beds24SourceBookings = await prisma.booking.findMany({
        where: {
            source: { in: ['BEDS24', 'beds24', 'Beds24'] },
            checkOut: { gte: new Date() },
        },
        include: { room: { select: { name: true } } },
    });

    // Try to resolve source from Beds24 API
    let beds24Bookings: any[] = [];
    try {
        const property = await prisma.property.findFirst({ where: { beds24RefreshToken: { not: null } } });
        if (property?.beds24RefreshToken) {
            const { getBeds24AccessToken, fetchBeds24Bookings } = await import('@/lib/beds24');
            const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);
            beds24Bookings = await fetchBeds24Bookings(accessToken);
        }
    } catch { /* non-fatal */ }

    const beds24ById = new Map<string, any>();
    for (const b of beds24Bookings) {
        if (b.id) beds24ById.set(b.id.toString(), b);
    }

    for (const booking of beds24SourceBookings) {
        const b24Data = booking.externalId ? beds24ById.get(booking.externalId) : null;
        const resolvedSource = b24Data
            ? mapChannelSource(b24Data.apiSource, b24Data.referer)
            : mapChannelSource(null, null);

        const sourceResult: any = {
            id: booking.id,
            guest: booking.guestName,
            room: booking.room?.name,
            currentSource: booking.source,
            resolvedSource,
            beds24ApiSource: b24Data?.apiSource || 'UNKNOWN',
            beds24Referer: b24Data?.referer || 'UNKNOWN',
        };

        if (applyFix && resolvedSource !== booking.source) {
            await prisma.booking.update({
                where: { id: booking.id },
                data: { source: resolvedSource },
            });
            sourceResult.action = 'SOURCE_FIXED';
        } else {
            sourceResult.action = 'AUDIT_ONLY';
        }

        results.push(sourceResult);
    }

    // ═══════════════════════════════════════════════════════════
    // 5. Find DEPOSIT_PAID bookings with missing payment data
    // ═══════════════════════════════════════════════════════════
    const missingPaymentData = await prisma.booking.findMany({
        where: {
            status: { in: ['DEPOSIT_PAID', 'FULLY_PAID', 'BALANCE_PENDING'] },
            depositAmount: null,
            checkOut: { gte: new Date() },
        },
        include: { room: { select: { name: true } } },
    });

    for (const booking of missingPaymentData) {
        const paymentResult: any = {
            id: booking.id,
            guest: booking.guestName,
            room: booking.room?.name,
            status: booking.status,
            depositAmount: booking.depositAmount,
            balanceAmount: booking.balanceAmount,
            stripeDepositId: booking.stripeDepositId || 'NONE',
            stripeCustomerId: booking.stripeCustomerId || 'NONE',
            issue: 'MISSING_PAYMENT_DATA',
        };

        // Try to recover from Zoho
        if (applyFix && booking.zohoId) {
            try {
                const zohoRecord = await zohoClient.getRecord('Bookings', booking.zohoId);
                if (zohoRecord) {
                    const deposit = parseFloat(zohoRecord.Deposit_Amount || '0');
                    const balance = parseFloat(zohoRecord.Balance_Amount || '0');
                    const stripeId = zohoRecord.Stripe_Deposit_ID || null;
                    const customerId = zohoRecord.Stripe_Customer_ID || null;
                    const paymentMethodId = zohoRecord.Stripe_Payment_Method_ID || null;

                    if (deposit > 0 || stripeId) {
                        await prisma.booking.update({
                            where: { id: booking.id },
                            data: {
                                ...(deposit > 0 ? { depositAmount: deposit } : {}),
                                ...(balance > 0 ? { balanceAmount: balance } : {}),
                                ...(stripeId ? { stripeDepositId: stripeId } : {}),
                                ...(customerId ? { stripeCustomerId: customerId } : {}),
                                ...(paymentMethodId ? { stripePaymentMethodId: paymentMethodId } : {}),
                                paymentMethod: 'card',
                                paymentStatus: 'partial',
                            },
                        });
                        paymentResult.action = 'PAYMENT_DATA_RECOVERED';
                        paymentResult.recovered = { deposit, balance, stripeId };
                    } else {
                        paymentResult.action = 'NO_ZOHO_PAYMENT_DATA';
                    }
                }
            } catch (err: any) {
                paymentResult.action = 'ERROR';
                paymentResult.error = err.message;
            }
        } else {
            paymentResult.action = 'AUDIT_ONLY';
        }

        results.push(paymentResult);
    }

    return NextResponse.json({
        message: applyFix ? 'Fixes applied' : 'Audit only — add &fix=true to apply',
        total: results.length,
        timestamp: new Date().toISOString(),
        results,
    });
}
