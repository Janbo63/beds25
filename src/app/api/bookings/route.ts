import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';

/**
 * Check for overlapping bookings on the same room.
 * Returns the conflicting booking if found, or null if no overlap.
 * Excludes the current booking (for PATCH/updates) via excludeBookingId.
 */
async function checkOverlap(roomId: string, checkIn: Date, checkOut: Date, excludeBookingId?: string) {
    const overlapping = await prisma.booking.findFirst({
        where: {
            roomId,
            id: excludeBookingId ? { not: excludeBookingId } : undefined,
            status: { notIn: ['CANCELLED', 'BLOCKED'] },
            // Overlap: existing check-in < new check-out AND existing check-out > new check-in
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
        },
        select: {
            id: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
        }
    });
    return overlapping;
}

/**
 * Validate booking constraints against room limits.
 * Returns an error message string or null if valid.
 */
async function validateBookingConstraints(
    roomId: string,
    checkIn: Date,
    checkOut: Date,
    numAdults: number,
    numChildren: number,
    excludeBookingId?: string
) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return { error: 'Room not found', status: 404 };

    // Validate max adults
    if (numAdults > room.maxAdults) {
        return { error: `This room allows a maximum of ${room.maxAdults} adults`, status: 400 };
    }

    // Validate total capacity
    const totalGuests = numAdults + numChildren;
    if (totalGuests > room.capacity) {
        return { error: `This room has a maximum capacity of ${room.capacity} guests`, status: 400 };
    }

    // Validate minimum nights
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    if (nights < 1) {
        return { error: 'Check-out must be after check-in', status: 400 };
    }
    if (nights < room.minNights) {
        return { error: `Minimum stay is ${room.minNights} night${room.minNights > 1 ? 's' : ''}`, status: 400 };
    }

    // Check for overlapping bookings
    const overlap = await checkOverlap(roomId, checkIn, checkOut, excludeBookingId);
    if (overlap) {
        const overlapIn = overlap.checkIn instanceof Date ? overlap.checkIn.toISOString().slice(0, 10) : String(overlap.checkIn).slice(0, 10);
        const overlapOut = overlap.checkOut instanceof Date ? overlap.checkOut.toISOString().slice(0, 10) : String(overlap.checkOut).slice(0, 10);
        return {
            error: `Date conflict: ${overlap.guestName} already has a booking from ${overlapIn} to ${overlapOut}`,
            status: 409
        };
    }

    return { room, error: null };
}


export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            roomId, guestName, guestEmail,
            numAdults, numChildren, guestAges,
            checkIn, checkOut, totalPrice,
            notes, status, source
        } = body;

        console.log('[API] Creating booking:', { roomId, guestName, dates: { checkIn, checkOut } });

        const adults = numAdults || 2;
        const children = numChildren || 0;
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);

        // Validate all constraints (capacity, min nights, overlaps)
        const validation = await validateBookingConstraints(roomId, checkInDate, checkOutDate, adults, children);
        if (validation.error) {
            return NextResponse.json({ error: validation.error }, { status: validation.status });
        }

        const room = validation.room;

        // Create booking via Zoho CRM service (writes to Zoho first, then local DB)
        const booking = await bookingService.create({
            roomId,
            roomNumber: room!.number,
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
    } catch (error: any) {
        console.error('Create Booking Error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return NextResponse.json({ error: error.message || 'Failed to create booking', details: error }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
        }

        // Fetch the existing booking to merge with updates
        const existing = await prisma.booking.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        }

        // Determine final values (use updated if provided, else existing)
        const finalRoomId = updates.roomId || existing.roomId;
        const finalCheckIn = updates.checkIn ? new Date(updates.checkIn) : existing.checkIn;
        const finalCheckOut = updates.checkOut ? new Date(updates.checkOut) : existing.checkOut;
        const finalAdults = updates.numAdults ?? existing.numAdults;
        const finalChildren = updates.numChildren ?? existing.numChildren;

        // Only run full validation if dates, room, or guest count changed
        const datesOrCapacityChanged = updates.checkIn || updates.checkOut || updates.roomId ||
            updates.numAdults !== undefined || updates.numChildren !== undefined;

        if (datesOrCapacityChanged) {
            const validation = await validateBookingConstraints(
                finalRoomId, finalCheckIn, finalCheckOut,
                finalAdults, finalChildren,
                id // Exclude this booking from overlap check
            );
            if (validation.error) {
                return NextResponse.json({ error: validation.error }, { status: validation.status });
            }
        }

        // Update booking via Zoho CRM service (writes to Zoho first, then local DB)
        const booking = await bookingService.update(id, updates);

        return NextResponse.json(booking);
    } catch (error: any) {
        console.error('Update Booking Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to update booking' }, { status: 500 });
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
