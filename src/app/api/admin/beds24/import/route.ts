import { NextRequest, NextResponse } from 'next/server';
import { importBeds24Data } from '@/lib/beds24';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        let { refreshToken } = await request.json();

        // If explicitly asked to refresh from stored DB token
        if (refreshToken === 'REFRESH') {
            const property = await prisma.property.findFirst({
                where: { beds24RefreshToken: { not: null } }
            });
            if (!property?.beds24RefreshToken) {
                return NextResponse.json({ error: 'No stored credentials found' }, { status: 400 });
            }
            refreshToken = property.beds24RefreshToken;
        }

        if (!refreshToken) {
            return NextResponse.json({ error: 'Refresh Token is required' }, { status: 400 });
        }

        const results = await importBeds24Data(refreshToken);

        return NextResponse.json({
            message: 'Import completed successfully',
            details: results
        });
    } catch (error: any) {
        console.error('Beds24 Import Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to import data from Beds24' }, { status: 500 });
    }
}
