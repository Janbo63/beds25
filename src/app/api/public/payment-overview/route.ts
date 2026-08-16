import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Show all bookings Jul-Aug 2026 with payment status overview.
 * Cross-references with Stripe to find any unpaid balances.
 * 
 * GET /api/public/payment-overview?key=beds25-payment-overview
 */
export async function GET(request: NextRequest) {
    const key = new URL(request.url).searchParams.get('key');
    if (key !== 'beds25-payment-overview') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    // Get all bookings Jul 1 - Aug 31 2026
    const bookings = await prisma.booking.findMany({
        where: {
            checkIn: { gte: new Date('2026-07-01') },
            checkOut: { lte: new Date('2026-09-01') },
            status: { not: 'CANCELLED' },
        },
        include: { room: { select: { name: true } } },
        orderBy: { checkIn: 'asc' },
    });

    // Pull all Stripe successful payments to cross-reference
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-01-27.acacia' });

    // Get Stripe payments from Jun 15 onwards (covers deposits for Jul bookings)
    const payments: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
        const list = await stripe.paymentIntents.list({
            limit: 100,
            created: { gte: Math.floor(new Date('2026-06-15').getTime() / 1000) },
            ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        for (const pi of list.data) {
            if (pi.status === 'succeeded') {
                payments.push(pi);
            }
        }

        hasMore = list.has_more;
        if (list.data.length > 0) {
            startingAfter = list.data[list.data.length - 1].id;
        }
    }

    // Index payments by customer ID for matching
    const paymentsByCustomer = new Map<string, any[]>();
    for (const pi of payments) {
        const cust = pi.customer as string;
        if (cust) {
            if (!paymentsByCustomer.has(cust)) paymentsByCustomer.set(cust, []);
            paymentsByCustomer.get(cust)!.push(pi);
        }
    }

    // Index by bookingRef from metadata
    const paymentsByRef = new Map<string, any[]>();
    for (const pi of payments) {
        const ref = pi.metadata?.bookingRef;
        if (ref) {
            if (!paymentsByRef.has(ref)) paymentsByRef.set(ref, []);
            paymentsByRef.get(ref)!.push(pi);
        }
    }

    // Index by stripeDepositId / stripeBalanceId
    const paymentsByPiId = new Map<string, any>();
    for (const pi of payments) {
        paymentsByPiId.set(pi.id, pi);
    }

    const now = new Date();
    const results: any[] = [];

    for (const booking of bookings) {
        const checkIn = booking.checkIn?.toISOString().split('T')[0];
        const checkOut = booking.checkOut?.toISOString().split('T')[0];
        const isWebsite = ['Website', 'alpaca-site', 'WEBSITE', 'Direct', 'DIRECT'].includes(booking.source || '');
        const isPast = booking.checkOut && booking.checkOut < now;
        const daysUntilCheckout = booking.checkOut ? Math.ceil((booking.checkOut.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

        // Find Stripe payments for this booking
        let depositPI = booking.stripeDepositId ? paymentsByPiId.get(booking.stripeDepositId) : null;
        let balancePI = booking.stripeBalanceId ? paymentsByPiId.get(booking.stripeBalanceId) : null;

        // Try by bookingRef
        if (!depositPI && booking.bookingRef) {
            const refPIs = paymentsByRef.get(booking.bookingRef);
            if (refPIs) {
                depositPI = refPIs.find(pi => pi.metadata?.type === 'booking_deposit');
                balancePI = balancePI || refPIs.find(pi => pi.metadata?.type === 'booking_balance');
            }
        }

        // Try by customer
        if (!balancePI && booking.stripeCustomerId) {
            const custPIs = paymentsByCustomer.get(booking.stripeCustomerId);
            if (custPIs) {
                // Find a balance-like payment (description contains "balance")
                balancePI = custPIs.find(pi =>
                    pi.id !== depositPI?.id &&
                    (pi.description?.toLowerCase().includes('balance') || pi.amount / 100 === booking.balanceAmount)
                );
            }
        }

        // Determine payment status
        let paymentSummary: string;
        if (booking.status === 'FULLY_PAID') {
            paymentSummary = '✅ FULLY_PAID';
        } else if (booking.status === 'DEPOSIT_PAID') {
            if (isPast) {
                paymentSummary = '⚠️ DEPOSIT_PAID — checkout passed, balance may be unpaid';
            } else if (daysUntilCheckout !== null && daysUntilCheckout <= 3) {
                paymentSummary = `🔔 DEPOSIT_PAID — balance due (${daysUntilCheckout} days to checkout)`;
            } else {
                paymentSummary = `💤 DEPOSIT_PAID — balance due later (${daysUntilCheckout} days)`;
            }
        } else if (booking.status === 'CONFIRMED' && isWebsite) {
            paymentSummary = '❌ CONFIRMED — no deposit recorded for website booking';
        } else if (booking.status === 'CONFIRMED') {
            paymentSummary = `— CONFIRMED (${booking.source || 'unknown source'})`;
        } else {
            paymentSummary = `— ${booking.status}`;
        }

        results.push({
            guest: booking.guestName,
            room: booking.room?.name,
            dates: `${checkIn} → ${checkOut}`,
            source: booking.source,
            status: booking.status,
            paymentSummary,
            deposit: booking.depositAmount ? `${booking.depositAmount} PLN` : null,
            balance: booking.balanceAmount ? `${booking.balanceAmount} PLN` : null,
            total: booking.totalPrice ? `${booking.totalPrice} PLN` : null,
            stripeDeposit: depositPI ? `✅ ${depositPI.id}` : (booking.stripeDepositId || null),
            stripeBalance: balancePI ? `✅ ${balancePI.id}` : (booking.stripeBalanceId || null),
            balancePaidAt: booking.balancePaidAt?.toISOString().split('T')[0] || (balancePI ? new Date(balancePI.created * 1000).toISOString().split('T')[0] : null),
            isPast,
            daysUntilCheckout,
        });
    }

    // Summary
    const websiteBookings = results.filter(r => ['Website', 'alpaca-site', 'WEBSITE'].includes(r.source));
    const fullyPaid = websiteBookings.filter(r => r.status === 'FULLY_PAID');
    const depositPaid = websiteBookings.filter(r => r.status === 'DEPOSIT_PAID');
    const unpaid = websiteBookings.filter(r => r.status === 'CONFIRMED');

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        summary: {
            totalBookingsJulAug: results.length,
            websiteBookings: websiteBookings.length,
            fullyPaid: fullyPaid.length,
            depositPaid: depositPaid.length,
            confirmedNoDeposit: unpaid.length,
            otherChannels: results.length - websiteBookings.length,
        },
        websiteBookings: websiteBookings.length > 0 ? websiteBookings : 'None found',
        allBookings: results,
    });
}
