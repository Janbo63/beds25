const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const result = await prisma.booking.updateMany({
            where: {
                status: 'CANCELLED'
            },
            data: {
                status: 'CONFIRMED'
            }
        });
        console.log(`Updated ${result.count} bookings to CONFIRMED.`);
    } catch (e) {
        console.error('Error updating bookings:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
