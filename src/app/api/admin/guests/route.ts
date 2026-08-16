import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10', 10) || 10;

    const guests = await prisma.guest.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : undefined,
      include: {
        _count: {
          select: { bookings: true },
        },
        bookings: {
          select: { checkIn: true },
          orderBy: { checkIn: 'desc' },
          take: 1,
        },
      },
      take: limit,
      orderBy: { name: 'asc' },
    });

    const formattedGuests = guests.map((guest: any) => ({
      id: guest.id,
      name: guest.name,
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      bookingCount: guest._count.bookings,
      lastStay: guest.bookings[0]?.checkIn || null,
    }));

    return NextResponse.json({ guests: formattedGuests });
  } catch (error) {
    console.error('Error in GET /api/admin/guests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
