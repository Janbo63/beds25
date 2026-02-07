import { NextRequest, NextResponse } from 'next/server';
import { generateIcalForRoom } from '@/lib/ical';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        const { roomId } = await params;
        const icalData = await generateIcalForRoom(roomId);

        return new NextResponse(icalData, {
            headers: {
                'Content-Type': 'text/calendar',
                'Content-Disposition': `attachment; filename="room-${roomId}.ics"`
            }
        });
    } catch (error) {
        console.error('iCal Export Error:', error);
        return new NextResponse('Error generating iCal', { status: 500 });
    }
}
