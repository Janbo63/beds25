import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateAlpacaAuth, corsHeaders, handleCorsOptions } from '@/lib/alpacaAuth';
import { getBeds24Token, getBeds24AccessToken } from '@/lib/beds24';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

const BLOCKING_STATUSES = ['DEPOSIT_PAID', 'BALANCE_PENDING', 'FULLY_PAID', 'CONFIRMED'];

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ bookingRef: string }> }
) {
    const authError = validateAlpacaAuth(request);
    if (authError) return authError;

    const { bookingRef } = await params;

    let body: { checkIn: string; checkOut: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders(request) });
    }

    const { checkIn, checkOut } = body;
    if (!checkIn || !checkOut) {
        return NextResponse.json({ error: 'checkIn and checkOut are required' }, { status: 400, headers: corsHeaders(request) });
    }

    const newCheckIn = new Date(checkIn);
    const newCheckOut = new Date(checkOut);

    if (isNaN(newCheckIn.getTime()) || isNaN(newCheckOut.getTime()) || newCheckIn >= newCheckOut) {
        return NextResponse.json({ error: 'Invalid dates' }, { status: 400, headers: corsHeaders(request) });
    }

    try {
        const booking = await prisma.booking.findUnique({ where: { bookingRef } });

        if (!booking) {
            return NextResponse.json({ error: 'Booking not found' }, { status: 404, headers: corsHeaders(request) });
        }

        if (booking.status === 'CANCELLED') {
            return NextResponse.json({ error: 'Cannot move a cancelled booking' }, { status: 409, headers: corsHeaders(request) });
        }

        // Check new dates are available (excluding current booking)
        const conflicting = await prisma.booking.findFirst({
            where: {
                roomId: booking.roomId,
                status: { in: BLOCKING_STATUSES },
                id: { not: booking.id },
                checkIn: { lt: newCheckOut },
                checkOut: { gt: newCheckIn },
            },
        });

        if (conflicting) {
            return NextResponse.json(
                { error: 'New dates are not available' },
                { status: 409, headers: corsHeaders(request) }
            );
        }

        // Recalculate balance due date (checkIn - 3 days)
        const balanceDueDate = new Date(newCheckIn);
        balanceDueDate.setDate(balanceDueDate.getDate() - 3);

        // Recalculate nights and total
        const nights = Math.ceil((newCheckOut.getTime() - newCheckIn.getTime()) / (1000 * 60 * 60 * 24));

        // Update local DB
        await prisma.booking.update({
            where: { id: booking.id },
            data: { checkIn: newCheckIn, checkOut: newCheckOut, balanceDueDate },
        });

        // Update Beds24 booking dates
        let beds24Updated = false;
        if (booking.externalId) {
            try {
                const property = await prisma.property.findFirst({
                    where: { rooms: { some: { id: booking.roomId } } },
                });

                if (property?.beds24RefreshToken) {
                    const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);
                    const res = await fetch('https://beds24.com/api/v2/bookings', {
                        method: 'POST',
                        headers: { token: accessToken, 'Content-Type': 'application/json' },
                        body: JSON.stringify([{
                            id: parseInt(booking.externalId),
                            arrival: format(newCheckIn, 'yyyy-MM-dd'),
                            departure: format(newCheckOut, 'yyyy-MM-dd'),
                        }]),
                    });
                    beds24Updated = res.ok;
                } else if (property?.beds24InviteCode) {
                    const auth = await getBeds24Token(property.beds24InviteCode);
                    const res = await fetch('https://beds24.com/api/v2/bookings', {
                        method: 'POST',
                        headers: { token: auth.token, 'Content-Type': 'application/json' },
                        body: JSON.stringify([{
                            id: parseInt(booking.externalId),
                            arrival: format(newCheckIn, 'yyyy-MM-dd'),
                            departure: format(newCheckOut, 'yyyy-MM-dd'),
                        }]),
                    });
                    beds24Updated = res.ok;
                }
            } catch (err) {
                console.error('[UpdateDates] Beds24 update failed (non-fatal):', err);
            }
        }

        return NextResponse.json(
            { bookingRef, checkIn, checkOut, nights, balanceDueDate: balanceDueDate.toISOString().split('T')[0], beds24Updated },
            { headers: corsHeaders(request) }
        );
    } catch (error) {
        console.error('[UpdateDates] Error:', error);
        return NextResponse.json(
            { error: 'Failed to update booking dates' },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return handleCorsOptions(request);
}
