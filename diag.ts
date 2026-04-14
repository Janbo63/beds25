import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const rooms = await prisma.room.findMany();
    const bookings = await prisma.booking.findMany({ select: { id: true, externalId: true, roomId: true, zohoId: true } });
    
    console.log(JSON.stringify({
        rooms: rooms.map(r => ({ id: r.id, name: r.name, externalId: r.externalId })),
        bookingCount: bookings.length,
        someBookings: bookings.slice(0, 5)
    }, null, 2));
}

main().catch(console.error);
