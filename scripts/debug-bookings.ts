import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const totalBookings = await prisma.booking.count();
    console.log(`Total Bookings: ${totalBookings}`);

    if (totalBookings > 0) {
        const bookings = await prisma.booking.findMany({
            take: 5,
            include: {
                room: true
            }
        });
        console.log('Sample Bookings:', JSON.stringify(bookings, null, 2));
    }

    const rooms = await prisma.room.count();
    console.log(`Total Rooms: ${rooms}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
