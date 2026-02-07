import { NextRequest, NextResponse } from 'next/server';
import { importBeds24Data } from '@/lib/beds24';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        let { inviteCode } = await request.json();

        if (inviteCode === 'REFRESH') {
            const property = await prisma.property.findFirst({
                where: { beds24InviteCode: { not: null } }
            });
            if (!property?.beds24InviteCode) {
                return NextResponse.json({ error: 'No stored credentials found' }, { status: 400 });
            }
            inviteCode = property.beds24InviteCode;
        }

        if (!inviteCode) {
            return NextResponse.json({ error: 'Invite Code is required' }, { status: 400 });
        }

        const results = await importBeds24Data(inviteCode);

        return NextResponse.json({
            message: 'Import completed successfully',
            details: results
        });
    } catch (error: any) {
        console.error('Beds24 Import Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to import data from Beds24' }, { status: 500 });
    }
}
