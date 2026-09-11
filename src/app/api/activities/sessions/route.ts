import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Find default property (Zagroda Alpakoterapii)
    const property = await prisma.property.findFirst();
    if (!property) {
      return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 });
    }

    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    // Ensure default 11:00 and 15:30 slots exist for this date
    const defaultTimes = ['11:00', '15:30'];
    for (const time of defaultTimes) {
      await prisma.activitySession.upsert({
        where: {
          propertyId_date_time: {
            propertyId: property.id,
            date: startOfDay,
            time
          }
        },
        update: {},
        create: {
          propertyId: property.id,
          date: startOfDay,
          time,
          activityType: 'MEET',
          status: 'SCHEDULED',
          maxCapacity: 15
        }
      });
    }

    // Fetch all sessions for this date with their bookings
    const sessions = await prisma.activitySession.findMany({
      where: {
        propertyId: property.id,
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        bookings: {
          include: {
            roomBooking: {
              include: {
                room: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      },
      orderBy: {
        time: 'asc'
      }
    });

    return NextResponse.json({
      success: true,
      date: dateStr,
      sessions
    });
  } catch (error) {
    console.error('Error fetching activity sessions:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, time, activityType = 'MEET', maxCapacity = 15, notes } = body;

    if (!date || !time) {
      return NextResponse.json({ success: false, error: 'Date and time are required' }, { status: 400 });
    }

    const property = await prisma.property.findFirst();
    if (!property) {
      return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 });
    }

    const normalizedDate = new Date(`${date}T00:00:00.000Z`);

    const session = await prisma.activitySession.upsert({
      where: {
        propertyId_date_time: {
          propertyId: property.id,
          date: normalizedDate,
          time
        }
      },
      update: {
        activityType,
        maxCapacity: Number(maxCapacity),
        notes
      },
      create: {
        propertyId: property.id,
        date: normalizedDate,
        time,
        activityType,
        maxCapacity: Number(maxCapacity),
        notes,
        status: 'SCHEDULED'
      },
      include: {
        bookings: true
      }
    });

    return NextResponse.json({ success: true, session });
  } catch (error) {
    console.error('Error creating activity session:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Session ID is required' }, { status: 400 });
    }

    // Delete associated bookings first
    await prisma.activityBooking.deleteMany({
      where: { sessionId: id }
    });

    // Delete the session
    await prisma.activitySession.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting activity session:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

