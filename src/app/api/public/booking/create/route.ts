import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateAlpacaAuth, corsHeaders, handleCorsOptions } from '@/lib/alpacaAuth';
import { createBeds24Booking } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

// Statuses that block availability — re-confirmed before accepting booking
const BLOCKING_STATUSES = ['DEPOSIT_PAID', 'BALANCE_PENDING', 'FULLY_PAID', 'CONFIRMED'];

export async function POST(request: NextRequest) {
    const authError = validateAlpacaAuth(request);
    if (authError) return authError;

    let body: {
        bookingRef: string;
        zohoBookingDealId: string;
        roomId: string;
        checkIn: string;
        checkOut: string;
        guestName: string;
        guestEmail: string;
        guestPhone?: string;
        adults: number;
        children?: { age: number }[];
        specialRequests?: string;
        nipNumber?: string;
        voucherCode?: string;
        voucherAmount?: number;
        depositAmount: number;
        balanceAmount: number;
        stripeDepositId: string;
        stripeCustomerId: string;
        stripePaymentMethodId: string;
        locale?: string;
        source?: string;
    };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders(request) });
    }

    const {
        bookingRef, zohoBookingDealId, roomId, checkIn, checkOut,
        guestName, guestEmail, guestPhone, adults, children = [],
        specialRequests, nipNumber, voucherCode, voucherAmount,
        depositAmount, balanceAmount, stripeDepositId, stripeCustomerId,
        stripePaymentMethodId, source = 'alpaca-site',
    } = body;

    // Validate required fields
    if (!bookingRef || !zohoBookingDealId || !roomId || !checkIn || !checkOut || !guestName || !guestEmail) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders(request) });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkInDate >= checkOutDate) {
        return NextResponse.json({ error: 'Invalid dates' }, { status: 400, headers: corsHeaders(request) });
    }

    try {
        // 1. Final availability re-check at point of creation (race condition guard)
        const conflicting = await prisma.booking.findFirst({
            where: {
                roomId,
                status: { in: BLOCKING_STATUSES },
                checkIn: { lt: checkOutDate },
                checkOut: { gt: checkInDate },
            },
        });

        if (conflicting) {
            return NextResponse.json(
                { error: 'Room is no longer available for these dates' },
                { status: 409, headers: corsHeaders(request) }
            );
        }

        // 2. Upsert guest
        let guestId: string | null = null;
        if (guestEmail) {
            const guest = await prisma.guest.upsert({
                where: { email: guestEmail },
                update: { name: guestName, phone: guestPhone ?? undefined },
                create: { name: guestName, email: guestEmail, phone: guestPhone ?? undefined },
            });
            guestId = guest.id;
        }

        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
        const totalPrice = depositAmount + balanceAmount;
        const balanceDueDate = new Date(checkInDate);
        balanceDueDate.setDate(balanceDueDate.getDate() - 3);

        // 3. Encode guest ages from children array
        const allAges = children.map((c) => c.age);
        const guestAges = allAges.length > 0 ? JSON.stringify(allAges) : null;

        // 4. Create booking in local DB
        const booking = await prisma.booking.create({
            data: {
                bookingRef,
                zohoBookingDealId,
                roomId,
                guestId,
                guestName,
                guestEmail,
                numAdults: adults,
                numChildren: children.length,
                guestAges,
                checkIn: checkInDate,
                checkOut: checkOutDate,
                totalPrice,
                depositAmount,
                depositPaidAt: new Date(),
                balanceAmount,
                balanceDueDate,
                status: 'DEPOSIT_PAID',
                source,
                stripeDepositId,
                stripeCustomerId,
                stripePaymentMethodId,
                specialRequests: specialRequests ?? null,
                nipNumber: nipNumber ?? null,
                voucherCode: voucherCode ?? null,
                discountAmount: voucherAmount ?? null,
                paymentMethod: 'card',
                paymentStatus: 'partial',
            },
        });

        // 5. Mirror to Beds24 (non-blocking — don't fail if Beds24 is down)
        let beds24BookingId: string | null = null;
        try {
            beds24BookingId = await createBeds24Booking({
                roomId,
                checkIn: checkInDate,
                checkOut: checkOutDate,
                guestName,
                guestEmail,
                phone: guestPhone ?? '',
                numAdults: adults,
                numChildren: children.length,
                totalPrice,
            });

            // Store Beds24 ID as externalId
            if (beds24BookingId) {
                await prisma.booking.update({
                    where: { id: booking.id },
                    data: { externalId: beds24BookingId.toString() },
                });
            }
        } catch (beds24Err) {
            console.error('[BookingCreate] Beds24 mirror failed (non-fatal):', beds24Err);
        }

        // 6. Mirror to Zoho CRM (non-blocking)
        try {
            const { bookingService } = await import('@/lib/zoho-service');
            const room = await prisma.room.findUnique({ where: { id: roomId } });
            if (room) {
                const updatedBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
                await bookingService.syncToZoho(updatedBooking, room);
                console.log('[BookingCreate] Zoho sync completed');
            }
        } catch (zohoErr) {
            console.error('[BookingCreate] Zoho sync failed (non-fatal):', zohoErr);
        }

        return NextResponse.json(
            {
                bookingRef: booking.bookingRef,
                beds24BookingId,
                status: booking.status,
                nights,
                balanceDueDate: balanceDueDate.toISOString().split('T')[0],
            },
            { status: 201, headers: corsHeaders(request) }
        );
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[BookingCreate] Error:', msg);
        return NextResponse.json(
            { error: 'Failed to create booking', detail: msg },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return handleCorsOptions(request);
}
