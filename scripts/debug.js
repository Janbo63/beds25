const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
    const ids = ['884394000001109001', '884394000001100001'];
    for(const id of ids) {
        const b = await prisma.booking.findUnique({ where: { id } });
        console.log(`Booking ${id} -> zohoId: ${b.zohoId}, externalId: ${b.externalId}`);
    }
}
check().catch(console.error).finally(() => prisma.$disconnect());
