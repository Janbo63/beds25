const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const properties = await prisma.property.count();
        const rooms = await prisma.room.count();
        const bookings = await prisma.booking.count();
        console.log(JSON.stringify({ properties, rooms, bookings }, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
