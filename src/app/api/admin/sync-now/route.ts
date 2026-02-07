import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { importExternalIcal } from '@/lib/ical-import';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        const syncs = await prisma.icalSync.findMany();

        const results = await Promise.allSettled(
            syncs.map((sync: { id: string }) => importExternalIcal(sync.id))
        );

        return NextResponse.json({
            message: 'Sync completed',
            count: syncs.length,
            details: results
        });
    } catch (error) {
        console.error('Manual Sync Error:', error);
        return NextResponse.json({ error: 'Failed to trigger sync' }, { status: 500 });
    }
}
