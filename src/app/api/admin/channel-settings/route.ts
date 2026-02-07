import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const { roomId, channel, multiplier } = await request.json();

        const setting = await prisma.channelSettings.upsert({
            where: {
                channel_roomId: {
                    channel,
                    roomId
                }
            },
            update: {
                multiplier: parseFloat(multiplier)
            },
            create: {
                channel,
                roomId,
                multiplier: parseFloat(multiplier)
            }
        });

        return NextResponse.json(setting);
    } catch (error) {
        console.error('Update Channel Settings Error:', error);
        return NextResponse.json({ error: 'Failed to update channel settings' }, { status: 500 });
    }
}
