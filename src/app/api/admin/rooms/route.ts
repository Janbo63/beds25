import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { roomService } from '@/lib/zoho-service';

export async function POST(request: NextRequest) {
    const body = await request.json();
    const {
        number, name, basePrice, capacity,
        maxAdults, maxChildren, minNights,
        airbnbUrl, bookingUrl, propertyId
    } = body;

    try {
        // Get first property if none provided
        // Get first property if none provided
        let actualPropertyId = propertyId;
        if (!actualPropertyId) {
            const prop = await prisma.property.findFirst();
            if (prop) {
                actualPropertyId = prop.id;
            } else {
                // If NO properties exist (e.g. fresh CI db), create a default one
                const newProp = await prisma.property.create({
                    data: {
                        name: 'Default Property',
                        address: '123 Main St',
                        email: 'admin@example.com'
                    }
                });
                actualPropertyId = newProp.id;
            }
        }

        // Create room via Zoho CRM service (writes to Zoho first, then local DB)
        const room = await roomService.create({
            number,
            name: name || number,
            basePrice: parseFloat(basePrice || '0'),
            capacity: parseInt(capacity || '2'),
            maxAdults: parseInt(maxAdults || '2'),
            maxChildren: parseInt(maxChildren || '0'),
            minNights: parseInt(minNights || '1'),
            propertyId: actualPropertyId,
        });

        // Handle iCal syncs separately (still local)
        if (airbnbUrl || bookingUrl) {
            const icalSyncs = [];
            if (airbnbUrl) icalSyncs.push({ channel: 'AIRBNB', url: airbnbUrl, roomId: room.id });
            if (bookingUrl) icalSyncs.push({ channel: 'BOOKING.COM', url: bookingUrl, roomId: room.id });

            await prisma.icalSync.createMany({
                data: icalSyncs
            });
        }

        return NextResponse.json(room);
    } catch (error: any) {
        // [DEBUG] Explicitly logging error for GitHub Actions
        console.error('SERVER ERROR - Room creation failed:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return NextResponse.json({ error: error.message || 'Failed to create room' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const rooms = await prisma.room.findMany({
            include: {
                media: true,
                channelSettings: true
            }
        });
        return NextResponse.json(rooms);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        // Clean up updates to ensure types are correct
        const data: any = {};
        if (updates.number !== undefined) data.number = updates.number;
        if (updates.name !== undefined) data.name = updates.name;
        if (updates.basePrice !== undefined) data.basePrice = parseFloat(updates.basePrice);
        if (updates.capacity !== undefined) data.capacity = parseInt(updates.capacity);
        if (updates.maxAdults !== undefined) data.maxAdults = parseInt(updates.maxAdults);
        if (updates.maxChildren !== undefined) data.maxChildren = parseInt(updates.maxChildren);
        if (updates.minNights !== undefined) data.minNights = parseInt(updates.minNights);

        // Update room via Zoho CRM service (writes to Zoho first, then local DB)
        const room = await roomService.update(id, data);

        return NextResponse.json(room);
    } catch (error: any) {
        console.error('Room update error:', error);
        return NextResponse.json({ error: error.message || 'Failed to update room' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        // Standard Guard Rail: Check for FUTURE bookings
        const futureBookingsCount = await prisma.booking.count({
            where: {
                roomId: id,
                checkOut: {
                    gte: new Date() // Check-out is in the future
                },
                status: {
                    not: 'CANCELLED' // Ignore cancelled bookings
                }
            }
        });

        if (futureBookingsCount > 0) {
            return NextResponse.json({
                error: `Cannot delete room. There are ${futureBookingsCount} active future bookings. Please cancel or move them first.`
            }, { status: 400 });
        }

        // Delete room via Zoho CRM service (deletes from Zoho first, then local DB)
        // Local DB deletion will cascade to PriceRules, ChannelSettings, Media, IcalSyncs, and PAST Bookings (due to schema change)
        await roomService.delete(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Delete Room Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to delete room' }, { status: 500 });
    }
}
