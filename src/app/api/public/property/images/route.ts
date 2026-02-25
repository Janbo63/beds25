import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateAlpacaAuth, corsHeaders, handleCorsOptions } from '@/lib/alpacaAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/property/images
 * Returns active property-level images from the Media model.
 * Optionally filtered by ?type=IMAGE or ?type=VIDEO (default: IMAGE only).
 *
 * These are property-wide photos (not room-specific) managed via
 * the MediaGallery in the admin Settings → General tab.
 */
export async function GET(request: NextRequest) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') return handleCorsOptions(request);

    const authError = validateAlpacaAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type')?.toUpperCase() ?? 'IMAGE';

    try {
        // Find the first property
        const property = await prisma.property.findFirst({
            select: { id: true, name: true },
        });

        if (!property) {
            return NextResponse.json(
                { error: 'No property configured' },
                { status: 404, headers: corsHeaders(request) }
            );
        }

        const media = await prisma.media.findMany({
            where: {
                propertyId: property.id,
                ...(typeFilter !== 'ALL' ? { type: typeFilter } : {}),
            },
            orderBy: [{ isHero: 'desc' }, { sortOrder: 'asc' }],
            select: {
                id: true,
                url: true,
                type: true,
                alt: true,
                caption: true,
                isHero: true,
                sortOrder: true,
            },
        });

        return NextResponse.json(
            {
                propertyId: property.id,
                propertyName: property.name,
                images: media,
            },
            { headers: corsHeaders(request) }
        );
    } catch (error) {
        console.error('[Public API] Property Images Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch property images' },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return handleCorsOptions(request);
}
