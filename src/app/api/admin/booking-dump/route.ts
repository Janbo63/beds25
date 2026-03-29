import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/booking-dump
 * 
 * Dumps ALL bookings from Beds25 database with their cross-reference IDs.
 * No interpretation, no grouping — just raw facts for manual verification.
 */
export async function GET() {
    const bookings = await prisma.booking.findMany({
        where: {
            checkIn: { gte: new Date('2026-03-01') }, // Only upcoming/recent
        },
        select: {
            id: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
            status: true,
            externalId: true,   // Beds24 ID
            zohoId: true,       // Zoho CRM ID
            source: true,
            isPrivate: true,
            room: { select: { name: true, number: true } },
        },
        orderBy: { checkIn: 'asc' },
    });

    // Group by guest+dates+room to find duplicates
    const groups: Record<string, typeof bookings> = {};
    for (const b of bookings) {
        if (b.status === 'CANCELLED') continue;
        const ci = (b.checkIn as Date).toISOString().slice(0, 10);
        const co = (b.checkOut as Date).toISOString().slice(0, 10);
        const key = `${(b.guestName || '').toLowerCase().trim()}|${ci}|${co}|${b.room?.number || ''}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(b);
    }

    const duplicates = Object.entries(groups)
        .filter(([, arr]) => arr.length > 1)
        .map(([key, arr]) => ({ key, records: arr }));

    // Records where Beds25 ID looks like a Zoho ID (Bug #2 artifacts)
    const bug2Artifacts = bookings.filter(b => /^\d{15,}$/.test(b.id));

    return NextResponse.json({
        totalBookings: bookings.length,
        duplicateGroups: duplicates.length,
        bug2Artifacts: bug2Artifacts.length,
        bookings: bookings.map(b => ({
            beds25Id: b.id,
            guest: b.guestName,
            checkIn: (b.checkIn as Date).toISOString().slice(0, 10),
            checkOut: (b.checkOut as Date).toISOString().slice(0, 10),
            status: b.status,
            beds24Id: b.externalId || null,
            zohoId: b.zohoId || null,
            room: b.room?.number || b.room?.name,
            source: b.source,
            private: b.isPrivate,
            idLooksLikeZoho: /^\d{15,}$/.test(b.id),
        })),
        duplicates,
        bug2Artifacts: bug2Artifacts.map(b => ({
            beds25Id: b.id,
            guest: b.guestName,
            beds24Id: b.externalId,
            zohoId: b.zohoId,
            status: b.status,
        })),
    });
}
