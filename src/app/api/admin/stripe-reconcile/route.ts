import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * Full Stripe ↔ Beds25 ↔ Zoho payment reconciliation audit.
 * Pulls all successful Stripe payments and cross-references with local DB and Zoho.
 * 
 * GET /api/public/stripe-reconcile?key=beds25-stripe-2026-08-16         → audit
 * GET /api/public/stripe-reconcile?key=beds25-stripe-2026-08-16&fix=true → fix gaps
 */
export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-stripe-2026-08-16') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    // 1. Pull all successful Stripe payments
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-01-27.acacia' });

    const payments: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
        const list = await stripe.paymentIntents.list({
            limit: 100,
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

    // 2. Get all local bookings with any Stripe data
    const allBookings = await prisma.booking.findMany({
        where: {
            OR: [
                { stripeDepositId: { not: null } },
                { stripePaymentIntentId: { not: null } },
                { stripeBalanceId: { not: null } },
                { stripeCustomerId: { not: null } },
                { status: { in: ['DEPOSIT_PAID', 'FULLY_PAID', 'BALANCE_PENDING', 'PAYMENT_FAILED'] } },
            ],
        },
        include: { room: { select: { name: true } } },
        orderBy: { checkIn: 'asc' },
    });

    // 3. Build Stripe payment index
    const stripeById = new Map<string, any>();
    for (const pi of payments) {
        stripeById.set(pi.id, pi);
    }

    // 4. Also index by metadata bookingRef
    const stripeByRef = new Map<string, any[]>();
    for (const pi of payments) {
        const ref = pi.metadata?.bookingRef;
        if (ref) {
            if (!stripeByRef.has(ref)) stripeByRef.set(ref, []);
            stripeByRef.get(ref)!.push(pi);
        }
    }

    // 5. Reconcile each booking
    const results: any[] = [];
    const matchedStripeIds = new Set<string>();

    for (const booking of allBookings) {
        const issues: string[] = [];
        const checkIn = booking.checkIn?.toISOString().split('T')[0];
        const checkOut = booking.checkOut?.toISOString().split('T')[0];

        // Find deposit payment in Stripe
        let depositPI = booking.stripeDepositId ? stripeById.get(booking.stripeDepositId) : null;
        if (!depositPI && booking.stripePaymentIntentId) {
            depositPI = stripeById.get(booking.stripePaymentIntentId);
        }
        // Try by bookingRef
        if (!depositPI && booking.bookingRef) {
            const refPIs = stripeByRef.get(booking.bookingRef);
            if (refPIs) {
                depositPI = refPIs.find(pi => pi.metadata?.type === 'booking_deposit' || !pi.metadata?.type);
            }
        }

        // Find balance payment in Stripe
        let balancePI = booking.stripeBalanceId ? stripeById.get(booking.stripeBalanceId) : null;
        if (!balancePI && booking.bookingRef) {
            const refPIs = stripeByRef.get(booking.bookingRef);
            if (refPIs) {
                balancePI = refPIs.find(pi => pi.metadata?.type === 'booking_balance');
            }
        }

        if (depositPI) matchedStripeIds.add(depositPI.id);
        if (balancePI) matchedStripeIds.add(balancePI.id);

        // Check for mismatches
        const stripeDepositAmount = depositPI ? (depositPI.amount / 100) : null;
        const stripeBalanceAmount = balancePI ? (balancePI.amount / 100) : null;
        const stripeCurrency = depositPI?.currency?.toUpperCase() || balancePI?.currency?.toUpperCase() || null;

        // Deposit alignment
        if (depositPI && !booking.depositAmount) {
            issues.push(`LOCAL_MISSING_DEPOSIT: Stripe has ${stripeDepositAmount} ${stripeCurrency} but local depositAmount is null`);
        } else if (depositPI && booking.depositAmount && Math.abs(booking.depositAmount - stripeDepositAmount!) > 0.01) {
            issues.push(`DEPOSIT_MISMATCH: local=${booking.depositAmount}, stripe=${stripeDepositAmount}`);
        }

        // Balance alignment
        if (balancePI && !booking.balanceAmount) {
            issues.push(`LOCAL_MISSING_BALANCE: Stripe has ${stripeBalanceAmount} ${stripeCurrency} but local balanceAmount is null`);
        }

        // Status alignment
        if (['DEPOSIT_PAID', 'BALANCE_PENDING'].includes(booking.status) && !depositPI) {
            issues.push(`NO_STRIPE_DEPOSIT: Status is ${booking.status} but no Stripe deposit payment found`);
        }
        if (booking.status === 'FULLY_PAID' && !balancePI) {
            issues.push(`NO_STRIPE_BALANCE: Status is FULLY_PAID but no Stripe balance payment found`);
        }

        // Missing Stripe IDs on local
        if (depositPI && !booking.stripeDepositId && !booking.stripePaymentIntentId) {
            issues.push(`LOCAL_MISSING_STRIPE_ID: Deposit PI ${depositPI.id} not linked`);
        }
        if (!booking.stripeCustomerId && depositPI?.customer) {
            issues.push(`LOCAL_MISSING_CUSTOMER_ID: Stripe has ${depositPI.customer}`);
        }
        if (!booking.stripePaymentMethodId && depositPI?.payment_method) {
            issues.push(`LOCAL_MISSING_PM_ID: Stripe has ${depositPI.payment_method}`);
        }

        const record: any = {
            bookingRef: booking.bookingRef,
            guest: booking.guestName,
            room: booking.room?.name,
            dates: `${checkIn} → ${checkOut}`,
            status: booking.status,
            local: {
                depositAmount: booking.depositAmount,
                balanceAmount: booking.balanceAmount,
                totalPrice: booking.totalPrice,
                stripeDepositId: booking.stripeDepositId || booking.stripePaymentIntentId || null,
                stripeBalanceId: booking.stripeBalanceId || null,
                stripeCustomerId: booking.stripeCustomerId || null,
                stripePaymentMethodId: booking.stripePaymentMethodId || null,
                paymentStatus: booking.paymentStatus,
            },
            stripe: {
                depositAmount: stripeDepositAmount,
                depositId: depositPI?.id || null,
                depositCustomer: depositPI?.customer || null,
                depositPM: depositPI?.payment_method || null,
                balanceAmount: stripeBalanceAmount,
                balanceId: balancePI?.id || null,
                currency: stripeCurrency,
            },
            issues: issues.length > 0 ? issues : 'ALIGNED',
        };

        // Apply fixes
        if (applyFix && issues.length > 0) {
            const fixes: Record<string, any> = {};

            if (depositPI && !booking.depositAmount) {
                fixes.depositAmount = stripeDepositAmount;
            }
            if (depositPI && !booking.stripeDepositId) {
                fixes.stripeDepositId = depositPI.id;
            }
            if (depositPI?.customer && !booking.stripeCustomerId) {
                fixes.stripeCustomerId = depositPI.customer as string;
            }
            if (depositPI?.payment_method && !booking.stripePaymentMethodId) {
                fixes.stripePaymentMethodId = depositPI.payment_method as string;
            }
            if (depositPI && !booking.balanceAmount && booking.totalPrice) {
                const balance = booking.totalPrice - (stripeDepositAmount || 0);
                if (balance > 0) fixes.balanceAmount = balance;
            }
            if (depositPI && !booking.paymentMethod) {
                fixes.paymentMethod = 'card';
            }

            if (Object.keys(fixes).length > 0) {
                await prisma.booking.update({
                    where: { id: booking.id },
                    data: fixes,
                });

                // Sync to Zoho
                try {
                    const { bookingService } = await import('@/lib/zoho-service');
                    const fresh = await prisma.booking.findUnique({
                        where: { id: booking.id },
                        include: { room: true },
                    });
                    if (fresh?.room) {
                        await bookingService.syncToZoho(fresh, fresh.room);
                    }
                } catch { /* non-fatal */ }

                record.fixes = fixes;
                record.action = 'FIXED';
            } else {
                record.action = 'NO_AUTO_FIX';
            }
        } else {
            record.action = issues.length > 0 ? 'NEEDS_FIX' : 'OK';
        }

        results.push(record);
    }

    // 6. Find unmatched Stripe payments (not linked to any booking)
    const unmatched: any[] = [];
    for (const pi of payments) {
        if (!matchedStripeIds.has(pi.id)) {
            unmatched.push({
                stripeId: pi.id,
                amount: pi.amount / 100,
                currency: pi.currency?.toUpperCase(),
                customer: pi.customer,
                description: pi.description,
                metadata: pi.metadata,
                created: new Date(pi.created * 1000).toISOString().split('T')[0],
                action: 'UNLINKED_STRIPE_PAYMENT',
            });
        }
    }

    const issueCount = results.filter(r => r.issues !== 'ALIGNED').length;

    return NextResponse.json({
        message: applyFix ? 'Reconciliation fixes applied' : 'Audit only — add &fix=true to apply',
        timestamp: new Date().toISOString(),
        summary: {
            totalStripePayments: payments.length,
            totalBookingsWithStripeData: allBookings.length,
            aligned: results.length - issueCount,
            misaligned: issueCount,
            unmatchedStripePayments: unmatched.length,
        },
        bookings: results,
        unmatchedStripePayments: unmatched,
    });
}
