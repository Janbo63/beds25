import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withCors, corsOptionsResponse } from '@/lib/cors';

export const dynamic = 'force-dynamic';

/**
 * Public Rooms API
 * GET /api/public/rooms?propertyId=X
 *
 * Returns room catalog with photos, amenities, capacity details.
 * No authentication required — used by the booking widget to display room info.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const roomId = searchParams.get('roomId');

    try {
        if (roomId) {
            // Single room detail
            const room = await prisma.room.findUnique({
                where: { id: roomId },
                include: {
                    media: { orderBy: { createdAt: 'asc' } },
                    property: {
                        select: {
                            id: true,
                            name: true,
                            address: true,
                            checkInTime: true,
                            checkOutTime: true,
                            facilities: true,
                            media: { orderBy: { createdAt: 'asc' } },
                        },
                    },
                },
            });

            if (!room) {
                return withCors(
                    NextResponse.json({ error: 'Room not found' }, { status: 404 }),
                    request
                );
            }

            return withCors(
                NextResponse.json({
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
                    basePrice: room.basePrice,
                    property: {
                        ...room.property,
                        facilities: room.property.facilities ? JSON.parse(room.property.facilities) : [],
                        media: room.property.media.map(m => ({
                            id: m.id,
                            url: m.url,
                            alt: m.alt,
                            type: m.type,
                        })),
                    },
                    media: room.media.map(m => ({
                        id: m.id,
                        url: m.url,
                        alt: m.alt,
                        type: m.type,
                    })),
                }),
                request
            );
        }

        // Room catalog
        const rooms = await prisma.room.findMany({
            where: propertyId ? { propertyId } : undefined,
            include: {
                media: { orderBy: { createdAt: 'asc' } },
                property: { select: { id: true, name: true } },
            },
            orderBy: { number: 'asc' },
        });

        const property = propertyId
            ? await prisma.property.findUnique({
                where: { id: propertyId },
                include: {
                    media: { orderBy: { createdAt: 'asc' } },
                },
            })
            : null;

        return withCors(
            NextResponse.json({
                property: property
                    ? {
                        id: property.id,
                        name: property.name,
                        description: property.description,
                        address: property.address,
                        checkInTime: property.checkInTime,
                        checkOutTime: property.checkOutTime,
                        facilities: property.facilities ? JSON.parse(property.facilities) : [],
                        media: property.media.map(m => ({
                            id: m.id,
                            url: m.url,
                            alt: m.alt,
                            type: m.type,
                        })),
                    }
                    : null,
                rooms: rooms.map(room => ({
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
                    basePrice: room.basePrice,
                    property: room.property,
                    media: room.media.map(m => ({
                        id: m.id,
                        url: m.url,
                        alt: m.alt,
                        type: m.type,
                    })),
                })),
            }),
            request
        );
    } catch (error: any) {
        console.error('[Public API] Rooms Error:', error);
        return withCors(
            NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 }),
            request
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return corsOptionsResponse(request);
}
