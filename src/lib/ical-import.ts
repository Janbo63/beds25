import ical from 'node-ical';
import prisma from './prisma';

export async function importExternalIcal(syncId: string) {
    const sync = await prisma.icalSync.findUnique({
        where: { id: syncId },
        include: { room: true }
    });

    if (!sync || !sync.url) return;

    try {
        const response = await fetch(sync.url);
        const data = await response.text();
        const events = ical.parseICS(data);

        // Filter confirmed external bookings
        const bookingsToAdd = Object.values(events)
            .filter((event) => event.type === 'VEVENT')
            .map((event: any) => ({
                roomId: sync.roomId,
                guestName: event.summary || 'External Booking',
                checkIn: new Date(event.start),
                checkOut: new Date(event.end),
                totalPrice: 0, // iCal doesn't provide price
                status: 'CONFIRMED',
                source: sync.channel,
                externalId: event.uid
            }));

        // Update database (simple version: clear and re-add or upsert)
        // For now, let's just create new ones that don't exist
        for (const booking of bookingsToAdd) {
            const existing = await prisma.booking.findFirst({
                where: {
                    roomId: booking.roomId,
                    externalId: booking.externalId,
                    source: booking.source
                }
            });

            if (!existing) {
                await prisma.booking.create({ data: booking });
            }
        }

        await prisma.icalSync.update({
            where: { id: syncId },
            data: { lastSynced: new Date() }
        });

    } catch (error) {
        console.error(`Error syncing iCal for ${sync.channel}:`, error);
    }
}
