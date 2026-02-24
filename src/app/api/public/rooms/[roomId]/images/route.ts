import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateAlpacaAuth, corsHeaders, handleCorsOptions } from '@/lib/alpacaAuth';

export const dynamic = 'force-dynamic';


export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    const authError = validateAlpacaAuth(request);
    if (authError) return authError;

    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // optional filter e.g. GALLERY

    try {
        const where: { roomId: string; active: boolean; type?: string } = {
            roomId,
            active: true,
        };
        if (type) where.type = type.toUpperCase();

        const images = await prisma.roomImage.findMany({
            where,
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true,
                url: true,
                type: true,
                altText: true,
                sortOrder: true,
            },
        });

        return NextResponse.json({ roomId, images }, { headers: corsHeaders(request) });
    } catch (error) {
        console.error('[RoomImages] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch images' },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return handleCorsOptions(request);
}
