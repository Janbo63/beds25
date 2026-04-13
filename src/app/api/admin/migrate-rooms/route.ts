import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const allRooms = await prisma.room.findMany();
        const legacyRooms = allRooms.filter(r => /^\d{15,19}$/.test(r.id) && r.externalId === null);
        const newRooms = allRooms.filter(r => !/^\d{15,19}$/.test(r.id) && r.externalId !== null);

        let mergedCount = 0;
        const mergeLogs = [];
        for (const legacy of legacyRooms) {
            const matchingNew = newRooms.find(r => r.name === legacy.name);
            if (matchingNew) {
                mergeLogs.push(`Merging ${legacy.name}... Transferring externalId ${matchingNew.externalId} to Zoho ID ${legacy.id}`);
                
                // Move bookings first
                await prisma.booking.updateMany({
                    where: { roomId: matchingNew.id },
                    data: { roomId: legacy.id }
                });

                // Nullify externalId on new room so we can transfer it to prevent unique constraint error
                await prisma.room.update({
                    where: { id: matchingNew.id },
                    data: { externalId: null }
                });

                // Update legacy room
                await prisma.room.update({
                    where: { id: legacy.id },
                    data: { externalId: matchingNew.externalId }
                });

                // Delete new ghost room
                await prisma.room.delete({
                    where: { id: matchingNew.id }
                });
                mergedCount++;
            }
        }
        
        // Final wipe of all broken Ghost bookings that may be stuck in the DB
        const deletedGhostBookings = await prisma.booking.deleteMany({
             where: { roomId: { not: { startsWith: '884' } } } // if not a valid zoho room ID, wipe it
        });

        return NextResponse.json({
            message: `Successfully merged ${mergedCount} rooms. Deleted ${deletedGhostBookings.count} ghost bookings from database.`,
            logs: mergeLogs
        }, { status: 200 });

    } catch (error: any) {
        console.error('Migration failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
