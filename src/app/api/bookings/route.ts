import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            roomId, guestName, guestEmail,
            numAdults, numChildren, guestAges,
            checkIn, checkOut, totalPrice,
            notes, status, source
        } = body;

        // Fetch room to validate constraints
        const room = await prisma.room.findUnique({
            where: { id: roomId }
        });

        if (!room) {
            return NextResponse.json({ error: 'Room not found' }, { status: 404 });
        }

        const adults = numAdults || 2;
        const children = numChildren || 0;

        // Validate max adults
        if (adults > room.maxAdults) {
            return NextResponse.json(
                { error: `This room allows a maximum of ${room.maxAdults} adults` },
                { status: 400 }
            );
        }

        // Validate total capacity
        const totalGuests = adults + children;
        if (totalGuests > room.capacity) {
            return NextResponse.json(
                { error: `This room has a maximum capacity of ${room.capacity} guests` },
                { status: 400 }
            );
        }

        // Validate minimum nights
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

        if (nights < room.minNights) {
            return NextResponse.json(
                { error: `Minimum stay is ${room.minNights} night${room.minNights > 1 ? 's' : ''}` },
                { status: 400 }
            );
        }

        // Create booking via Zoho CRM service (writes to Zoho first, then local DB)
        const booking = await bookingService.create({
            roomId,
            roomNumber: room.number,
            guestName,
            guestEmail,
            numAdults: adults,
            numChildren: children,
            guestAges: guestAges || null,
            checkIn: checkInDate,
            checkOut: checkOutDate,
            totalPrice,
            notes: notes || null,
            status,
            source: source || 'DIRECT',
        });

        return NextResponse.json(booking);
    } catch (error) {
        console.error('Create Booking Error:', error);
        return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, status, ...updates } = body;

        // Update booking via Zoho CRM service (writes to Zoho first, then local DB)
        const booking = await bookingService.update(id, {
            status,
            ...updates
        });

        return NextResponse.json(booking);
    } catch (error) {
        console.error('Update Booking Error:', error);
        return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        await bookingService.delete(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Delete Booking Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to delete booking' }, { status: 500 });
    }
}
