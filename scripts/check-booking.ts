const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Looking for externalId: 83496641");
    const booking = await prisma.booking.findFirst({
        where: { externalId: '83496641' }
    });
    console.log("Found:", booking);
}
main().finally(() => prisma.$disconnect());
