const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const count = await prisma.booking.count();
        console.log('--- DATABASE CHECK ---');
        console.log('Total bookings found:', count);

        const latest = await prisma.booking.findMany({
            take: 3,
            orderBy: { createdAt: 'desc' }
        });
        console.log('Latest 3 bookings:', JSON.stringify(latest, null, 2));

        const rooms = await prisma.room.count();
        console.log('Total rooms:', rooms);

        const bookingDates = await prisma.booking.findMany({
            select: { checkIn: true, checkOut: true },
            take: 10
        });
        console.log('Sample dates:', bookingDates);

    } catch (e) {
        console.error('Prisma Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
