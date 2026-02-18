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
    // Direct mapping: Production Room DB ID → Beds24 Room ID
    // This avoids fuzzy name matching issues with similar room names
    const mapping: Array<{ dbId: string; beds24Id: string; name: string }> = [
        { dbId: '884394000000896001', beds24Id: '223647', name: 'Apartment (Triple) with Mountain View' },
        { dbId: '884394000000894006', beds24Id: '223648', name: 'Triple Room with Private Bathroom' },
        { dbId: '884394000000897001', beds24Id: '269838', name: 'Triple Room with Private Bathroom 2' },
        { dbId: '884394000000884002', beds24Id: '507521', name: 'Caravan' },
    ];

    const results: Array<{ room: string; status: string; externalId?: string }> = [];

    for (const { dbId, beds24Id, name } of mapping) {
        const room = await prisma.room.findUnique({ where: { id: dbId } });

        if (!room) {
            results.push({ room: name, status: 'NOT_FOUND' });
            continue;
        }

        if (room.externalId === beds24Id) {
            results.push({ room: name, status: 'ALREADY_SET', externalId: beds24Id });
            continue;
        }

        await prisma.room.update({
            where: { id: dbId },
            data: { externalId: beds24Id }
        });

        results.push({ room: name, status: 'UPDATED', externalId: beds24Id });
    }

    return NextResponse.json({ success: true, results });
}
