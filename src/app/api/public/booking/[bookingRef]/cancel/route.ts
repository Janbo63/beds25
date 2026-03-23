import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateAlpacaAuth, corsHeaders, handleCorsOptions } from '@/lib/alpacaAuth';
import { cancelBeds24Booking } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ bookingRef: string }> }
) {
    const authError = validateAlpacaAuth(request);
    if (authError) return authError;

    const { bookingRef } = await params;

    try {
        const booking = await prisma.booking.findUnique({
            where: { bookingRef },
        });

        if (!booking) {
            return NextResponse.json(
                { error: 'Booking not found' },
                { status: 404, headers: corsHeaders(request) }
            );
        }

        if (booking.status === 'CANCELLED') {
            return NextResponse.json(
                { error: 'Booking is already cancelled' },
                { status: 409, headers: corsHeaders(request) }
            );
        }

        // Update local DB
        await prisma.booking.update({
            where: { id: booking.id },
            data: { status: 'CANCELLED', paymentStatus: 'refunded' },
        });

        // Cancel in Beds24 (releases OTA calendar dates)
        let beds24Updated = false;
        if (booking.externalId) {
            try {
                await cancelBeds24Booking(booking.externalId);
                beds24Updated = true;
            } catch (err) {
                console.error('[BookingCancel] Beds24 cancel failed (non-fatal):', err);
            }
        }

        // Update Zoho Booking status (non-blocking)
        try {
            const { bookingService } = await import('@/lib/zoho-service');
            const room = await prisma.room.findUnique({ where: { id: booking.roomId } });
            if (room) {
                const freshBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
                await bookingService.syncToZoho(freshBooking, room);
            }
        } catch (zohoErr) {
            console.error('[BookingCancel] Zoho sync failed (non-fatal):', zohoErr);
        }

        return NextResponse.json(
            { status: 'CANCELLED', beds24Updated },
            { headers: corsHeaders(request) }
        );
    } catch (error) {
        console.error('[BookingCancel] Error:', error);
        return NextResponse.json(
            { error: 'Failed to cancel booking' },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return handleCorsOptions(request);
}
