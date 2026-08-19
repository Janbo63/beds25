import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { logToStef } from '@/lib/stef-logger';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Retry Zoho Sync Cron
 * GET/POST /api/cron/retry-zoho-sync
 *
 * Runs periodically (or on demand) to find active/upcoming bookings
 * where zohoId is missing (e.g. from temporary network glitches, rate limits,
 * or API errors) and retries synchronization with Zoho CRM.
 */
export async function GET(request: NextRequest) {
    return handleRetry(request);
}

export async function POST(request: NextRequest) {
    return handleRetry(request);
}

async function handleRetry(request: NextRequest) {
    // Check cron secret if provided in headers (optional for admin panel triggers)
    const secret = request.headers.get('x-cron-secret') ?? request.headers.get('authorization')?.replace('Bearer ', '');
    if (CRON_SECRET && secret && secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find active/upcoming bookings missing a Zoho record ID
        const unSyncedBookings = await prisma.booking.findMany({
            where: {
                zohoId: null,
                status: { notIn: ['CANCELLED', 'BLOCKED'] },
                checkOut: { gte: today },
            },
            include: {
                room: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 10, // Batch limit per execution to respect API quotas
        });

        if (unSyncedBookings.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'All active bookings are synced with Zoho CRM',
                processed: 0,
                results: [],
            });
        }

        console.log(`[RetryZohoSync] Found ${unSyncedBookings.length} bookings to sync to Zoho...`);

        const results: Array<{
            id: string;
            guestName: string;
            status: 'SYNCED' | 'FAILED';
            zohoId?: string;
            error?: string;
        }> = [];

        for (const booking of unSyncedBookings) {
            try {
                const syncRes = await bookingService.syncToZoho(booking, booking.room);
                results.push({
                    id: booking.id,
                    guestName: booking.guestName,
                    status: 'SYNCED',
                    zohoId: syncRes?.id,
                });
                console.log(`[RetryZohoSync] Successfully synced booking ${booking.id} (${booking.guestName}) -> Zoho: ${syncRes?.id}`);
            } catch (err: any) {
                console.error(`[RetryZohoSync] Failed to sync booking ${booking.id}:`, err?.message);
                results.push({
                    id: booking.id,
                    guestName: booking.guestName,
                    status: 'FAILED',
                    error: err?.message || 'Unknown error',
                });
            }
        }

        const successCount = results.filter(r => r.status === 'SYNCED').length;
        const failedCount = results.filter(r => r.status === 'FAILED').length;

        if (failedCount > 0) {
            await logToStef('warn', `Zoho retry cron processed ${results.length} bookings: ${successCount} synced, ${failedCount} failed`, {
                results,
            });
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            synced: successCount,
            failed: failedCount,
            results,
        });
    } catch (error: any) {
        console.error('[RetryZohoSync] Cron fatal error:', error);
        await logToStef('error', `Zoho retry cron fatal error: ${error?.message}`, {
            error: error?.message,
            stack: error?.stack,
        });
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
