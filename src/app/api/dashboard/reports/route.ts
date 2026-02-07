import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const propertyId = searchParams.get('propertyId');
    const source = searchParams.get('source');

    try {
        const where: any = {};

        if (startDate && endDate) {
            where.checkIn = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        if (propertyId) {
            where.room = {
                propertyId: propertyId
            };
        }

        if (source) {
            where.source = source;
        }

        const bookings = await prisma.booking.findMany({
            where,
            include: {
                room: {
                    include: {
                        property: true
                    }
                },
                guest: true
            },
            orderBy: {
                checkIn: 'desc'
            }
        });

        const properties = await prisma.property.findMany();

        return NextResponse.json({
            bookings: bookings.map(b => ({
                id: b.id,
                guestName: b.guestName,
                guestEmail: b.guestEmail,
                roomName: b.room.name || b.room.number,
                propertyName: b.room.property.name,
                checkIn: b.checkIn,
                checkOut: b.checkOut,
                totalPrice: b.totalPrice,
                status: b.status,
                source: b.source,
                guestDetails: b.guest
            })),
            properties
        });
    } catch (error) {
        console.error('Reports API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch report data' }, { status: 500 });
    }
}
