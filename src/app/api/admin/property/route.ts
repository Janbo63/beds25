import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const property = await prisma.property.findFirst({
            include: { media: { orderBy: [{ isHero: 'desc' }, { sortOrder: 'asc' }] } }
        });
        return NextResponse.json(property || {});
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const { id, bookingComId, airbnbId } = await request.json();

        const property = await prisma.property.update({
            where: { id },
            data: {
                bookingComId: bookingComId || null,
                airbnbId: airbnbId || null,
            }
        });

        return NextResponse.json(property);
    } catch (error) {
        console.error('Update Property Error:', error);
        return NextResponse.json({ error: 'Failed to update property' }, { status: 500 });
    }
}
