import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withCors, corsOptionsResponse } from '@/lib/cors';

export const dynamic = 'force-dynamic';

/**
 * Public Availability API
 * GET /api/public/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&propertyId=X
 *
 * Returns available rooms with calculated prices for the given date range.
 * No authentication required — this is called by the public booking widget.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const propertyId = searchParams.get('propertyId');

    if (!checkIn || !checkOut) {
        return withCors(
            NextResponse.json({ error: 'checkIn and checkOut are required (YYYY-MM-DD)' }, { status: 400 }),
            request
        );
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        return withCors(
            NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 }),
            request
        );
    }

    if (checkInDate >= checkOutDate) {
        return withCors(
            NextResponse.json({ error: 'checkOut must be after checkIn' }, { status: 400 }),
            request
        );
    }

    // Don't allow bookings in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkInDate < today) {
        return withCors(
            NextResponse.json({ error: 'Cannot check availability for past dates' }, { status: 400 }),
            request
        );
    }

    try {
        // 1. Get all rooms for the property (or all rooms if no propertyId)
        const rooms = await prisma.room.findMany({
            where: propertyId ? { propertyId } : undefined,
            include: {
                media: { orderBy: { createdAt: 'asc' } },
                property: { select: { name: true, id: true } },
            },
        });

        // 2. Get existing bookings that overlap with the requested date range
        const existingBookings = await prisma.booking.findMany({
            where: {
                status: { notIn: ['CANCELLED'] },
                checkIn: { lt: checkOutDate },
                checkOut: { gt: checkInDate },
            },
            select: { roomId: true },
        });

        const bookedRoomIds = new Set(existingBookings.map(b => b.roomId));

        // 3. Get price rules for the date range
        const priceRules = await prisma.priceRule.findMany({
            where: {
                date: { gte: checkInDate, lt: checkOutDate },
            },
        });

        // Group price rules by room
        const priceRulesByRoom = new Map<string, Map<string, { price: number; isAvailable: boolean; minStay: number | null }>>();
        for (const rule of priceRules) {
            const dateKey = rule.date.toISOString().split('T')[0];
            if (!priceRulesByRoom.has(rule.roomId)) {
                priceRulesByRoom.set(rule.roomId, new Map());
            }
            priceRulesByRoom.get(rule.roomId)!.set(dateKey, {
                price: rule.price,
                isAvailable: rule.isAvailable,
                minStay: rule.minStay,
            });
        }

        // 4. Calculate total price and availability for each room
        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

        const availableRooms = rooms
            .filter(room => !bookedRoomIds.has(room.id))
            .filter(room => nights >= room.minNights)
            .map(room => {
                const roomRules = priceRulesByRoom.get(room.id);
                let totalPrice = 0;
                let allDatesAvailable = true;
                const nightlyPrices: { date: string; price: number }[] = [];

                // Calculate price for each night
                for (let i = 0; i < nights; i++) {
                    const date = new Date(checkInDate);
                    date.setDate(date.getDate() + i);
                    const dateKey = date.toISOString().split('T')[0];

                    const rule = roomRules?.get(dateKey);

                    if (rule && !rule.isAvailable) {
                        allDatesAvailable = false;
                        break;
                    }

                    // Check minStay override from price rules
                    if (rule?.minStay && nights < rule.minStay) {
                        allDatesAvailable = false;
                        break;
                    }

                    const nightPrice = rule?.price ?? room.basePrice;
                    totalPrice += nightPrice;
                    nightlyPrices.push({ date: dateKey, price: nightPrice });
                }

                if (!allDatesAvailable) return null;

                return {
                    id: room.id,
                    name: room.name,
                    number: room.number,
                    description: room.description,
                    roomType: room.roomType,
                    capacity: room.capacity,
                    maxAdults: room.maxAdults,
                    maxChildren: room.maxChildren,
                    minNights: room.minNights,
                    size: room.size,
                    bedConfig: room.bedConfig,
                    amenities: room.amenities ? JSON.parse(room.amenities) : [],
                    viewType: room.viewType,
                    property: room.property,
                    media: room.media.map(m => ({
                        id: m.id,
                        url: m.url,
                        alt: m.alt,
                        type: m.type,
                    })),
                    pricing: {
                        nights,
                        totalPrice: Math.round(totalPrice * 100) / 100,
                        averagePerNight: Math.round((totalPrice / nights) * 100) / 100,
                        currency: 'PLN',
                        nightlyBreakdown: nightlyPrices,
                    },
                };
            })
            .filter(Boolean);

        return withCors(
            NextResponse.json({
                checkIn,
                checkOut,
                nights,
                availableRooms,
                totalRooms: rooms.length,
            }),
            request
        );
    } catch (error: any) {
        console.error('[Public API] Availability Error:', error);
        return withCors(
            NextResponse.json({ error: 'Failed to check availability' }, { status: 500 }),
            request
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return corsOptionsResponse(request);
}
