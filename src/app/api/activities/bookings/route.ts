import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId,
      guestName,
      phone,
      email,
      numAdults = 2,
      numChildren = 0,
      isRoomGuest = false,
      roomBookingId,
      totalPrice = 0,
      paymentStatus = 'UNPAID',
      paymentMethod = 'CASH',
      notes
    } = body;

    if (!sessionId || !guestName) {
      return NextResponse.json({ success: false, error: 'Session ID and Guest Name are required' }, { status: 400 });
    }

    const booking = await prisma.activityBooking.create({
      data: {
        sessionId,
        guestName: guestName.trim(),
        phone: phone ? phone.trim() : null,
        email: email ? email.trim() : null,
        numAdults: Number(numAdults),
        numChildren: Number(numChildren),
        isRoomGuest: Boolean(isRoomGuest),
        roomBookingId: roomBookingId || null,
        totalPrice: Number(totalPrice),
        paymentStatus: isRoomGuest ? 'FREE_PERK' : paymentStatus,
        paymentMethod: isRoomGuest ? 'INCLUDED' : paymentMethod,
        notes: notes ? notes.trim() : null
      },
      include: {
        roomBooking: {
          include: {
            room: true
          }
        }
      }
    });

    return NextResponse.json({ success: true, booking });
  } catch (error) {
    console.error('Error creating activity booking:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Booking ID required' }, { status: 400 });
    }

    await prisma.activityBooking.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting activity booking:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, paymentStatus, paymentMethod, notes } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Booking ID required' }, { status: 400 });
    }

    const updated = await prisma.activityBooking.update({
      where: { id },
      data: {
        ...(paymentStatus && { paymentStatus }),
        ...(paymentMethod && { paymentMethod }),
        ...(notes !== undefined && { notes })
      }
    });

    return NextResponse.json({ success: true, booking: updated });
  } catch (error) {
    console.error('Error updating activity booking:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
