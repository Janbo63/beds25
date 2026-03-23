import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { createBeds24Booking } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { bookingId, issueType } = body;

        if (!bookingId || !issueType) {
            return NextResponse.json({ error: 'bookingId and issueType required' }, { status: 400 });
        }

        const booking = await prisma.booking.findUnique({ 
            where: { id: bookingId },
            include: { room: true }
        });

        if (!booking || !booking.room) {
            return NextResponse.json({ error: 'Booking or Room not found' }, { status: 404 });
        }

        console.log(`[SyncFix] Attempting to fix ${issueType} for booking ${bookingId}`);

        if (issueType === 'zoho_record_not_found') {
            // The record was deleted in Zoho. We need to clear our local zohoId and re-sync to recreate it.
            await prisma.booking.update({ where: { id: bookingId }, data: { zohoId: null } });
            const freshBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
            if (freshBooking) {
                await bookingService.syncToZoho(freshBooking, booking.room);
            }
        } 
        else if (['missing_zoho_id', 'zoho_status_mismatch', 'zoho_date_mismatch'].includes(issueType)) {
            // Just force a re-sync to Zoho (upsert handles creation or update)
            await bookingService.syncToZoho(booking, booking.room);
        } 
        else if (issueType === 'missing_beds24_id') {
            // Booking not in Beds24. Create it and store externalId.
            const beds24Id = await createBeds24Booking(booking);
            if (beds24Id) {
                await prisma.booking.update({ 
                    where: { id: bookingId }, 
                    data: { externalId: beds24Id.toString() } 
                });
            } else {
                 throw new Error("Failed to create Beds24 booking, no ID returned.");
            }
        }
        else {
             return NextResponse.json({ error: 'Unknown issue type' }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: `Fixed ${issueType}` });

    } catch (error: any) {
        console.error('[SyncFix] Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fix issue' }, { status: 500 });
    }
}
