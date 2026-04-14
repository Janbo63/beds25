import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function mergeRooms() {
    const allRooms = await prisma.room.findMany();
    const legacyRooms = allRooms.filter(r => /^\d{15,19}$/.test(r.id) && r.externalId === null);
    const newRooms = allRooms.filter(r => !/^\d{15,19}$/.test(r.id) && r.externalId !== null);

    let mergedCount = 0;
    for (const legacy of legacyRooms) {
        const matchingNew = newRooms.find(r => r.name === legacy.name);
        if (matchingNew) {
            console.log(`Merging ${legacy.name}... Transferring externalId ${matchingNew.externalId} to ${legacy.id}`);
            
            // Move bookings first
            await prisma.booking.updateMany({
                where: { roomId: matchingNew.id },
                data: { roomId: legacy.id }
            });

            // Nullify externalId on new room so we can transfer it
            await prisma.room.update({
                where: { id: matchingNew.id },
                data: { externalId: null }
            });

            // Update legacy room
            await prisma.room.update({
                where: { id: legacy.id },
                data: { externalId: matchingNew.externalId }
            });

            // Delete new room
            await prisma.room.delete({
                where: { id: matchingNew.id }
            });
            mergedCount++;
        }
    }
    console.log(`Merged ${mergedCount} rooms.`);
}

mergeRooms().then(() => process.exit(0)).catch(console.error);
