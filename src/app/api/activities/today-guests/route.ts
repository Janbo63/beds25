import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const targetDate = new Date(`${dateStr}T12:00:00.000Z`);

    // Find all room bookings active on this date (checkIn <= targetDate and checkOut > targetDate)
    const bookings = await prisma.booking.findMany({
      where: {
        checkIn: {
          lte: targetDate
        },
        checkOut: {
          gt: targetDate
        },
        status: {
          not: 'CANCELLED'
        }
      },
      include: {
        room: true,
        guest: true
      },
      orderBy: {
        room: {
          name: 'asc'
        }
      }
    });

    const guests = bookings.map(b => ({
      bookingId: b.id,
      guestName: b.guestName || b.guest?.name || 'Gość',
      phone: b.guest?.phone || null,
      roomName: b.room?.name || b.room?.internalName || `Pokój ${b.room?.number || ''}`,
      numAdults: b.numAdults || 2,
      numChildren: b.numChildren || 0,
      checkIn: b.checkIn.toISOString().split('T')[0],
      checkOut: b.checkOut.toISOString().split('T')[0]
    }));

    return NextResponse.json({ success: true, date: dateStr, count: guests.length, guests });
  } catch (error) {
    console.error('Error fetching today room guests:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
