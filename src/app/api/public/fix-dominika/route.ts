import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * Link Dominika's orphan Zoho booking to her Beds25 record and sync dates.
 * 
 * GET /api/public/fix-dominika?key=beds25-dominika         → audit
 * GET /api/public/fix-dominika?key=beds25-dominika&fix=true → apply
 */
export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-dominika') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    const zohoId = '884394000001883002';
    const beds25Id = 'cmsrgamvl000gjmmcbb2krxx1';

    const booking = await prisma.booking.findUnique({
        where: { id: beds25Id },
        include: { room: true },
    });

    const zohoRecord = await zohoClient.getRecord('Bookings', zohoId);

    if (!booking || !zohoRecord) {
        return NextResponse.json({
            error: 'Booking or Zoho record not found',
            booking: booking ? 'found' : 'NOT_FOUND',
            zoho: zohoRecord ? 'found' : 'NOT_FOUND',
        });
    }

    const result: any = {
        guest: booking.guestName,
        beds25: {
            id: beds25Id,
            checkIn: booking.checkIn?.toISOString().split('T')[0],
            checkOut: booking.checkOut?.toISOString().split('T')[0],
            room: booking.room?.name,
            zohoId: booking.zohoId,
        },
        zoho: {
            id: zohoId,
            checkIn: zohoRecord.Check_In,
            checkOut: zohoRecord.Check_Out,
            room: zohoRecord.Room?.name,
            guest: zohoRecord.Guest?.name,
            status: zohoRecord.Booking_status,
        },
        dateMismatch: booking.checkOut?.toISOString().split('T')[0] !== zohoRecord.Check_Out,
    };

    if (applyFix) {
        // Link Beds25 → Zoho
        await prisma.booking.update({
            where: { id: beds25Id },
            data: { zohoId },
        });

        // Update Zoho with Beds25ID and sync dates from Beds25 (local is source of truth)
        await zohoClient.updateRecord('Bookings', zohoId, {
            Beds25ID: beds25Id,
            Check_In: booking.checkIn?.toISOString().split('T')[0],
            Check_Out: booking.checkOut?.toISOString().split('T')[0],
        });

        result.action = 'LINKED_AND_SYNCED';
        result.note = 'Beds25 dates pushed to Zoho (Beds25 is source of truth)';
    } else {
        result.action = 'AUDIT_ONLY';
    }

    return NextResponse.json({
        message: applyFix ? 'Dominika booking linked and synced' : 'Audit only',
        timestamp: new Date().toISOString(),
        result,
    });
}
