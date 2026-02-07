import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, addDays } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const start = startParam ? new Date(startParam) : startOfMonth(addDays(new Date(), -30)); // Start from 30 days ago
    const end = endParam ? new Date(endParam) : endOfMonth(addDays(new Date(), 150)); // Show ~6 months ahead

    try {
        const rooms = await prisma.room.findMany({
            include: {
                bookings: {
                    where: {
                        OR: [
                            { checkIn: { lte: end, gte: start } },
                            { checkOut: { lte: end, gte: start } },
                            { AND: [{ checkIn: { lte: start } }, { checkOut: { gte: end } }] }
                        ],
                        status: { not: 'CANCELLED' }
                    }
                },
                priceRules: {
                    where: {
                        date: { gte: start, lte: end }
                    }
                }
            },
            orderBy: {
                number: 'asc'
            }
        });

        const days = eachDayOfInterval({ start, end });

        const data = rooms.map((room: any) => {
            // Convert price rules to date-indexed object
            const prices: { [date: string]: { price: number } } = {};
            room.priceRules.forEach((rule: any) => {
                const dateStr = format(new Date(rule.date), 'yyyy-MM-dd');
                prices[dateStr] = { price: rule.price };
            });

            return {
                id: room.id,
                number: room.number || room.name,
                name: room.name,
                type: room.name,
                basePrice: room.basePrice,
                prices,
                bookings: room.bookings.map((b: any) => ({
                    id: b.id,
                    guestName: b.guestName,
                    guestEmail: b.guestEmail,
                    numAdults: b.numAdults,
                    numChildren: b.numChildren,
                    guestAges: b.guestAges,
                    notes: b.notes,
                    checkIn: b.checkIn,
                    checkOut: b.checkOut,
                    source: b.source,
                    status: b.status,
                    totalPrice: b.totalPrice,
                    externalId: b.externalId
                }))
            };
        });

        return NextResponse.json({
            days: days.map(d => format(d, 'yyyy-MM-dd')),
            rooms: data
        });
    } catch (error) {
        console.error('Tape Chart API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch tape chart data' }, { status: 500 });
    }
}
