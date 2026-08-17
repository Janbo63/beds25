import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const updates = [
        { id: '884394000000896001', internalName: 'Apartment', sortOrder: 1 },
        { id: '884394000000897001', internalName: 'Jungle Room', sortOrder: 2 },
        { id: '884394000000894006', internalName: 'Garden Room', sortOrder: 3 },
        { id: '884394000000884002', internalName: 'Caravan', sortOrder: 4 },
    ];

    const results = [];
    for (const u of updates) {
        try {
            await prisma.room.update({
                where: { id: u.id },
                data: { internalName: u.internalName, sortOrder: u.sortOrder },
            });
            results.push({ ...u, status: 'OK' });
        } catch (err: any) {
            results.push({ ...u, status: 'ERROR', error: err?.message });
        }
    }

    return NextResponse.json({ message: 'Room order updated', results });
}
