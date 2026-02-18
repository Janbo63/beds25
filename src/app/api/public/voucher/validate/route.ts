import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withCors, corsOptionsResponse } from '@/lib/cors';

export const dynamic = 'force-dynamic';

/**
 * Public Voucher Validation API
 * POST /api/public/voucher/validate
 *
 * Validates a voucher code and returns the discount details.
 * No authentication required — used by the booking widget before checkout.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { code, totalAmount, nights } = body;

        if (!code) {
            return withCors(
                NextResponse.json({ error: 'Voucher code is required' }, { status: 400 }),
                request
            );
        }

        const voucher = await prisma.voucherCode.findUnique({
            where: { code: code.toUpperCase().trim() },
        });

        if (!voucher) {
            return withCors(
                NextResponse.json({ valid: false, reason: 'Invalid voucher code' }),
                request
            );
        }

        if (!voucher.isActive) {
            return withCors(
                NextResponse.json({ valid: false, reason: 'This voucher is no longer active' }),
                request
            );
        }

        // Date checks
        const now = new Date();
        if (voucher.validFrom && new Date(voucher.validFrom) > now) {
            return withCors(
                NextResponse.json({ valid: false, reason: 'This voucher is not yet valid' }),
                request
            );
        }
        if (voucher.validUntil && new Date(voucher.validUntil) < now) {
            return withCors(
                NextResponse.json({ valid: false, reason: 'This voucher has expired' }),
                request
            );
        }

        // Usage limit check
        if (voucher.maxUses && voucher.usedCount >= voucher.maxUses) {
            return withCors(
                NextResponse.json({ valid: false, reason: 'This voucher has reached its usage limit' }),
                request
            );
        }

        // Minimum nights check
        if (voucher.minNights && nights && nights < voucher.minNights) {
            return withCors(
                NextResponse.json({
                    valid: false,
                    reason: `Minimum ${voucher.minNights} night(s) required for this voucher`,
                }),
                request
            );
        }

        // Minimum booking value check
        if (voucher.minBookingValue && totalAmount && totalAmount < voucher.minBookingValue) {
            return withCors(
                NextResponse.json({
                    valid: false,
                    reason: `Minimum booking value of ${voucher.minBookingValue} ${voucher.currency || 'PLN'} required`,
                }),
                request
            );
        }

        // Calculate discount
        let discountAmount = 0;
        if (totalAmount) {
            if (voucher.discountType === 'percentage' || voucher.discountType === 'Percentage') {
                discountAmount = Math.round((totalAmount * voucher.discountValue) / 100 * 100) / 100;
            } else {
                discountAmount = voucher.discountValue;
            }
        }

        return withCors(
            NextResponse.json({
                valid: true,
                discountType: voucher.discountType,
                discountValue: voucher.discountValue,
                discountAmount,
                description: voucher.description,
                currency: voucher.currency || 'PLN',
            }),
            request
        );
    } catch (error: any) {
        console.error('[Public API] Voucher Validation Error:', error);
        return withCors(
            NextResponse.json({ error: 'Failed to validate voucher' }, { status: 500 }),
            request
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return corsOptionsResponse(request);
}
