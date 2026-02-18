import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { addDays, format, parseISO } from 'date-fns';

export const dynamic = 'force-dynamic';

/**
 * Webhook Handler for Beds24 Auto Actions
 * 
 * Recommended Beds24 Auto Action Configuration:
 * Trigger: specific triggering action (New Booking, Modify Booking, Cancel Booking)
 * Action: "Send to URL"
 * URL: https://[YOUR_DOMAIN]/api/webhooks/beds24
 * Data: JSON
 * {
 *   "bookId": "[bookid]",
 *   "roomId": "[roomid]",
 *   "status": "[status]",
 *   "firstNight": "[firstnight]",
 *   "lastNight": "[lastnight]",
 *   "guestFirstName": "[guestfirstname]",
 *   "guestLastName": "[guestlastname]",
 *   "guestEmail": "[guestemail]",
 *   "guestPhone": "[guestphone]",
 *   "numAdult": "[numadult]",
 *   "numChild": "[numchild]",
 *   "price": "[price]",
 *   "referer": "[referer]",
 *   "apiSource": "[apisource]"
 * }
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
            return new NextResponse('Missing bookId or roomId', { status: 400 });
        }

        // Map Status
        let mappedStatus = 'CONFIRMED';
        if (status === '0' || status === 'Cancelled') mappedStatus = 'CANCELLED';
        else if (status === '1' || status === 'Confirmed') mappedStatus = 'CONFIRMED';
        else if (status === '2' || status === 'New') mappedStatus = 'NEW';
        else if (status === '3' || status === 'Request') mappedStatus = 'REQUEST';
        else if (status === '4' || status === 'Black' || status === 'Blocked') mappedStatus = 'BLOCKED';

        // Normalize Dates
        // Beds24 sends YYYY-MM-DD usually.
        // lastNight is the night BEFORE checkout. Checkout is lastNight + 1 day.
        const checkIn = new Date(firstNight);
        const checkOut = addDays(new Date(lastNight), 1);

        // Find Room (by externalId)
        const room = await prisma.room.findUnique({
            where: { externalId: roomId.toString() }
        });

        if (!room) {
            console.error(`[Webhook] Room with externalId ${roomId} not found.`);
            return new NextResponse(`Room ${roomId} not found`, { status: 404 });
        }

        // Check if booking exists
        const existingBooking = await prisma.booking.findFirst({
            where: { externalId: bookId.toString() }
        });

        const bookingData = {
            roomId: room.id, // mapped local room ID
            roomNumber: room.number, // needed for Zoho mapping
            guestName: `${guestFirstName || ''} ${guestLastName || ''}`.trim() || 'Guest',
            guestEmail: guestEmail || '',
            guestPhone: guestPhone || '', // Add phone if schema supports it (Guest model does)
            checkIn,
            checkOut,
            status: mappedStatus,
            source: referer || apiSource || 'BEDS24',
            totalPrice: parseFloat(price || '0'),
            numAdults: parseInt(numAdult || '2'),
            numChildren: parseInt(numChild || '0'),
            externalId: bookId.toString(), // Important: prevents outgoing sync loop!
            notes: `Imported via Webhook from ${referer || 'Beds24'}`
        };

        if (existingBooking) {
            console.log(`[Webhook] Updating existing booking ${existingBooking.id}`);
            await bookingService.update(existingBooking.id, bookingData);
        } else {
            console.log(`[Webhook] Creating new booking from Beds24`);
            await bookingService.create(bookingData);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Webhook] Error processing Beds24 webhook:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
