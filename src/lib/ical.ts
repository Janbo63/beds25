import ical, { ICalCalendarMethod } from 'ical-generator';
import prisma from './prisma';

interface BookingWithSource {
    id: string;
    checkIn: Date;
    checkOut: Date;
    source: string;
}

export async function generateIcalForRoom(roomId: string) {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
            bookings: {
                where: { status: 'CONFIRMED' }
            }
        }
    });

    if (!room) {
        throw new Error('Room not found');
    }

    const calendar = ical({
        name: `Beds25 - ${room.name || room.number}`,
        method: ICalCalendarMethod.PUBLISH
    });

    room.bookings.forEach((booking: BookingWithSource) => {
        calendar.createEvent({
            start: booking.checkIn,
            end: booking.checkOut,
            summary: 'Reserved',
            description: `Booking via ${booking.source}`,
            id: booking.id
        });
    });

    return calendar.toString();
}
