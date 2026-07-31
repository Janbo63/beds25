import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { withCors, corsOptionsResponse } from '@/lib/cors';

export const dynamic = 'force-dynamic';

/**
 * Generate a human-readable booking reference: ZAT-YYYY-NNNN
 */
async function generateBookingRef(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ZAT-${year}-`;

    // Find the latest booking ref for this year
    const latestBooking = await prisma.booking.findFirst({
        where: {
            bookingRef: { startsWith: prefix },
        },
        orderBy: { createdAt: 'desc' },
        select: { bookingRef: true },
    });

    let nextNum = 1;
    if (latestBooking?.bookingRef) {
        const numPart = latestBooking.bookingRef.replace(prefix, '');
        nextNum = parseInt(numPart, 10) + 1;
    }

    return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * Public Booking API
 * POST /api/public/booking
 *
 * Creates a confirmed booking after Stripe payment succeeds.
 * Called by the Alpaca website webhook handler after checkout.session.completed.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            roomId,
            guestName,
            guestEmail,
            guestPhone,
            numAdults,
            numChildren,
            guestAges,
            checkIn,
            checkOut,
            totalPrice,
            notes,
            voucherCode,
            discountAmount,
            depositAmount,
            balanceAmount,
            stripePaymentIntentId,
            stripeCustomerId,
            locale,
        } = body;

        // Validate required fields
        if (!roomId || !guestName || !guestEmail || !checkIn || !checkOut || totalPrice === undefined) {
            return withCors(
                NextResponse.json({
                    error: 'Missing required fields: roomId, guestName, guestEmail, checkIn, checkOut, totalPrice',
                }, { status: 400 }),
                request
            );
        }

        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const adults = numAdults || 2;
        const children = numChildren || 0;

        // Validate room exists
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
            return withCors(
                NextResponse.json({ error: 'Room not found' }, { status: 404 }),
                request
            );
        }

        // Validate capacity
        if (adults > room.maxAdults) {
            return withCors(
                NextResponse.json({ error: `Maximum ${room.maxAdults} adults allowed` }, { status: 400 }),
                request
            );
        }
        if (adults + children > room.capacity) {
            return withCors(
                NextResponse.json({ error: `Maximum capacity is ${room.capacity} guests` }, { status: 400 }),
                request
            );
        }

        // Validate min nights
        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
        if (nights < room.minNights) {
            return withCors(
                NextResponse.json({ error: `Minimum stay is ${room.minNights} night(s)` }, { status: 400 }),
                request
            );
        }

        // Check for overlapping bookings
        const overlap = await prisma.booking.findFirst({
            where: {
                roomId,
                status: { notIn: ['CANCELLED', 'BLOCKED'] },
                checkIn: { lt: checkOutDate },
                checkOut: { gt: checkInDate },
            },
        });

        if (overlap) {
            return withCors(
                NextResponse.json({ error: 'Room is not available for these dates' }, { status: 409 }),
                request
            );
        }

        // Generate booking reference
        const bookingRef = await generateBookingRef();

        // Calculate balance due date (3 days before check-in)
        const balanceDueDate = new Date(checkInDate);
        balanceDueDate.setDate(balanceDueDate.getDate() - 3);

        // ═══ LOCAL-FIRST: Write to local DB first to prevent orphans ═══
        // Previously this called bookingService.create() which writes Zoho FIRST.
        // If the subsequent local DB write failed, Zoho had an orphan record with
        // real payment data but Beds25/Beds24 were blind to it. (Kamila Kozaczyk incident, 27 Jul 2026)
        const localBooking = await prisma.booking.create({
            data: {
                bookingRef,
                roomId,
                guestName,
                guestEmail,
                numAdults: adults,
                numChildren: children,
                guestAges: guestAges || null,
                checkIn: checkInDate,
                checkOut: checkOutDate,
                totalPrice,
                notes: notes || null,
                status: depositAmount ? 'DEPOSIT_PAID' : 'CONFIRMED',
                source: 'Website',
                voucherCode: voucherCode || null,
                discountAmount: discountAmount || null,
                paymentMethod: 'card',
                paymentTiming: 'pay_online_now',
                paymentStatus: depositAmount ? 'partial' : 'paid',
                currency: 'PLN',
                depositAmount: depositAmount || null,
                depositPaidAt: depositAmount ? new Date() : null,
                balanceAmount: balanceAmount || null,
                balanceDueDate: balanceAmount ? balanceDueDate : null,
                stripePaymentIntentId: stripePaymentIntentId || null,
                stripeCustomerId: stripeCustomerId || null,
            },
        });

        // Find or create guest record
        if (guestEmail) {
            await prisma.guest.upsert({
                where: { email: guestEmail },
                update: {
                    name: guestName,
                    phone: guestPhone || undefined,
                    language: locale || 'pl',
                },
                create: {
                    name: guestName,
                    email: guestEmail,
                    phone: guestPhone || null,
                    language: locale || 'pl',
                },
            });
        }

        // ═══ SYNC: Push to Zoho and Beds24 (non-blocking) ═══
        // If these fail, the local record is safe and will be retried on next sync

        // Sync to Zoho CRM
        try {
            await bookingService.syncToZoho(localBooking, room);
            console.log('[Public API] Zoho sync completed for', localBooking.id);
        } catch (zohoErr) {
            console.error('[Public API] Zoho sync failed (non-fatal, will retry on next sync):', zohoErr);
        }

        // Push to Beds24 for channel availability blocking
        try {
            const { createBeds24Booking } = await import('@/lib/beds24');
            const beds24Id = await createBeds24Booking({
                roomId,
                checkIn: checkInDate,
                checkOut: checkOutDate,
                guestName,
                guestEmail,
                phone: guestPhone || '',
                numAdults: adults,
                numChildren: children,
                totalPrice,
            });
            if (beds24Id) {
                await prisma.booking.update({
                    where: { id: localBooking.id },
                    data: { externalId: beds24Id.toString() },
                });
                console.log('[Public API] Beds24 booking created:', beds24Id);
            }
        } catch (beds24Err) {
            console.error('[Public API] Beds24 push failed (non-fatal):', beds24Err);
        }

        return withCors(
            NextResponse.json({
                success: true,
                bookingId: localBooking.id,
                bookingRef,
                status: localBooking.status,
                checkIn,
                checkOut,
                nights,
                totalPrice,
                depositAmount: depositAmount || totalPrice,
                balanceAmount: balanceAmount || 0,
                balanceDueDate: balanceDueDate.toISOString().split('T')[0],
            }, { status: 201 }),
            request
        );
    } catch (error: any) {
        console.error('[Public API] Booking Error:', error);
        return withCors(
            NextResponse.json({ error: error.message || 'Failed to create booking' }, { status: 500 }),
            request
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return corsOptionsResponse(request);
}
