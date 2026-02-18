import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { addDays } from 'date-fns';

export const dynamic = 'force-dynamic';

/**
 * Health check — visit /api/webhooks/beds24 in browser to verify endpoint is live
 */
export async function GET() {
    return NextResponse.json({ status: 'ok', endpoint: 'beds24-webhook', timestamp: new Date().toISOString() });
}

/**
 * Webhook Handler for Beds24 Auto Actions
 * 
 * Beds24 Auto Action Configuration:
 * Trigger Tab: Trigger Action = Auto, Trigger Event = Booking, Trigger Time = Immediate
 * Webhook Tab:
 *   URL: https://bookings.zagrodaalpakoterapii.com/api/webhooks/beds24
 *   Custom Header: Content-Type:application/json
 *   Body Data:
 *   {"bookId":"[BOOKID]","roomId":"[ROOMID]","status":"[STATUS]","firstNight":"[FIRSTNIGHT]","lastNight":"[LASTNIGHT]","guestFirstName":"[GUESTFIRSTNAME]","guestLastName":"[GUESTLASTNAME]","guestEmail":"[GUESTEMAIL]","guestPhone":"[GUESTPHONE]","numAdult":"[NUMADULT]","numChild":"[NUMCHILD]","price":"[PRICE]","referer":"[REFERER]","apiSource":"[APISOURCE]"}
 */
export async function POST(request: NextRequest) {
    try {
        const payload = await request.json();
        console.log('[Webhook] Received Beds24 payload:', JSON.stringify(payload, null, 2));

        const {
            bookId, roomId, status, firstNight, lastNight,
            guestFirstName, guestLastName, guestEmail, guestPhone,
            numAdult, numChild, price, referer, apiSource
        } = payload;

        if (!bookId || !roomId) {
            console.error('[Webhook] Missing bookId or roomId in payload');
            return NextResponse.json({ error: 'Missing bookId or roomId' }, { status: 400 });
        }

        // Map Status
        let mappedStatus = 'CONFIRMED';
        if (status === '0' || status === 'Cancelled') mappedStatus = 'CANCELLED';
        else if (status === '1' || status === 'Confirmed') mappedStatus = 'CONFIRMED';
        else if (status === '2' || status === 'New') mappedStatus = 'NEW';
        else if (status === '3' || status === 'Request') mappedStatus = 'REQUEST';
        else if (status === '4' || status === 'Black' || status === 'Blocked') mappedStatus = 'BLOCKED';

        // Normalize Dates
        // Beds24: lastNight is the last night of stay. Checkout = lastNight + 1 day.
        const checkIn = new Date(firstNight);
        const checkOut = addDays(new Date(lastNight), 1);

        // Find Room (by externalId = Beds24 Room ID)
        const room = await prisma.room.findUnique({
            where: { externalId: roomId.toString() }
        });

        if (!room) {
            console.error(`[Webhook] Room with externalId ${roomId} not found in Beds25 DB.`);
            return NextResponse.json({ error: `Room ${roomId} not found` }, { status: 404 });
        }

        console.log(`[Webhook] Matched room: ${room.name} (${room.id})`);

        // Check if booking already exists (update vs create)
        const existingBooking = await prisma.booking.findFirst({
            where: { externalId: bookId.toString() }
        });

        // Build booking data — NOTE: do NOT include guestPhone here,
        // it's not a field on the Booking model (phone lives on Guest model)
        const bookingData = {
            roomId: room.id,
            roomNumber: room.number, // needed for Zoho mapping
            guestName: `${guestFirstName || ''} ${guestLastName || ''}`.trim() || 'Guest',
            guestEmail: guestEmail || '',
            checkIn,
            checkOut,
            status: mappedStatus,
            source: referer || apiSource || 'BEDS24',
            totalPrice: parseFloat(price || '0'),
            numAdults: parseInt(numAdult || '2'),
            numChildren: parseInt(numChild || '0'),
            externalId: bookId.toString(), // Prevents outgoing sync loop!
            notes: `Imported via Webhook from ${referer || 'Beds24'}`
        };

        if (existingBooking) {
            console.log(`[Webhook] Updating existing booking ${existingBooking.id}`);
            await bookingService.update(existingBooking.id, bookingData);
        } else {
            console.log(`[Webhook] Creating new booking from Beds24`);
            await bookingService.create(bookingData);
        }

        console.log('[Webhook] Successfully processed Beds24 webhook');
        return NextResponse.json({ success: true, bookId, roomId, status: mappedStatus });
    } catch (error: any) {
        console.error('[Webhook] Error processing Beds24 webhook:', error?.message || error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error?.message || 'Unknown error' },
            { status: 500 }
        );
    }
}
