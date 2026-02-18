import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * One-time migration: Set Beds24 Room IDs (externalId) on production rooms.
 * 
 * GET  → List rooms with current externalId status
 * POST → Set externalIds based on known Beds24 mapping
 * 
 * This endpoint should be removed after migration is confirmed.
 */
export async function GET() {
    const rooms = await prisma.room.findMany({
        select: { id: true, name: true, number: true, externalId: true },
        orderBy: { number: 'asc' }
    });
    return NextResponse.json({ rooms });
}

export async function POST() {
    // Known Beds24 Room ID mapping (from Beds24 dashboard)
    // These are the Beds24 Room IDs that correspond to our rooms
    const mapping: Record<string, string> = {
        'Apartment (Triple) with Mountain View': '223647',
        'Triple Room with Private Bathroom 2': '269838',   // Must be before "Triple Room with Private Bathroom" for correct matching
        'Triple Room with Private Bathroom': '223648',
        'Caravan': '507521',
    };

    const results: Array<{ room: string; status: string; externalId?: string }> = [];

    for (const [roomName, beds24Id] of Object.entries(mapping)) {
        const room = await prisma.room.findFirst({
            where: {
                OR: [
                    { name: { contains: roomName } },
                    { internalName: { contains: roomName } },
                ]
            }
        });

        if (!room) {
            results.push({ room: roomName, status: 'NOT_FOUND' });
            continue;
        }

        if (room.externalId === beds24Id) {
            results.push({ room: roomName, status: 'ALREADY_SET', externalId: beds24Id });
            continue;
        }

        await prisma.room.update({
            where: { id: room.id },
            data: { externalId: beds24Id }
        });

        results.push({ room: roomName, status: 'UPDATED', externalId: beds24Id });
    }

    return NextResponse.json({ success: true, results });
}
