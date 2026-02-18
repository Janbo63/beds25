
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const rooms = await prisma.room.findMany({
        select: {
            id: true,
            name: true,
            externalId: true,
            property: {
                select: {
                    name: true,
                    beds24InviteCode: true
                }
            }
        }
    });

    console.log('--- Room Mapping Check ---');
    rooms.forEach(r => {
        console.log(`Room: ${r.name} | ID: ${r.id} | Beds24 ID (externalId): ${r.externalId || 'MISSING'}`);
        if (!r.externalId) {
            console.error(`Status: ❌ MAPPING MISSING for ${r.name}`);
        } else {
            console.log(`Status: ✅ Mapped to ${r.externalId}`);
        }
    });

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
