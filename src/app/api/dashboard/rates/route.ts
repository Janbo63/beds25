import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, startOfDay } from 'date-fns';
import { updateBeds24Rates } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const start = startParam ? startOfDay(new Date(startParam)) : startOfMonth(new Date());
    const end = endParam ? startOfDay(new Date(endParam)) : addDays(start, 30);

    try {
        const rooms = await prisma.room.findMany({
            include: {
                property: true,
                priceRules: {
                    where: {
                        date: {
                            gte: start,
                            lte: end
                        }
                    }
                }
            }
        });

        const days = eachDayOfInterval({ start, end });

        const data = rooms.map((room: any) => ({
            id: room.id,
            name: `${room.number} (${room.name})`,
            propertyName: room.property.name,
            basePrice: room.basePrice,
            externalId: room.externalId,
            prices: room.priceRules.reduce((acc: any, rule: any) => {
                acc[format(rule.date, 'yyyy-MM-dd')] = {
                    price: rule.price,
                    id: rule.id
                };
                return acc;
            }, {})
        }));

        return NextResponse.json({
            days: days.map(d => format(d, 'yyyy-MM-dd')),
            rooms: data
        });
    } catch (error) {
        console.error('Rates API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch rates data' }, { status: 500 });
    }
}

function addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { roomId, date, price } = body;

        if (!roomId || !date || price === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const parsedDate = startOfDay(new Date(date));

        const updatedRule = await prisma.priceRule.upsert({
            where: {
                roomId_date: {
                    roomId,
                    date: parsedDate
                }
            },
            update: {
                price: parseFloat(price)
            },
            create: {
                roomId,
                date: parsedDate,
                price: parseFloat(price)
            }
        });

        // Trigger push to Beds24
        try {
            await updateBeds24Rates(roomId, format(parsedDate, 'yyyy-MM-dd'), parseFloat(price));
        } catch (syncError) {
            console.error('Beds24 Sync Warning:', syncError);
        }

        return NextResponse.json(updatedRule);
    } catch (error) {
        console.error('Save Rate Error:', error);
        return NextResponse.json({ error: 'Failed to save rate' }, { status: 500 });
    }
}
