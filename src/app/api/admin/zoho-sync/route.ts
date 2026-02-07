import { NextRequest, NextResponse } from 'next/server';
import { bookingService, roomService } from '@/lib/zoho-service';

/**
 * Sync endpoint to manually pull data from Zoho CRM to local DB
 * 
 * This is useful for:
 * - Initial data import
 * - Manual refresh when needed
 * - Scheduled cron jobs
 */

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const entity = searchParams.get('entity') || 'all';

        const results: any = {
            success: true,
            synced: {}
        };

        // Sync bookings
        if (entity === 'all' || entity === 'bookings') {
            const bookingsCount = await bookingService.syncFromZoho();
            results.synced.bookings = bookingsCount;
        }

        // Sync rooms
        if (entity === 'all' || entity === 'rooms') {
            const roomsCount = await roomService.syncFromZoho();
            results.synced.rooms = roomsCount;
        }

        return NextResponse.json(results);
    } catch (error: any) {
        console.error('Zoho sync error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Sync failed'
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return NextResponse.json({
        message: 'Zoho CRM Sync Endpoint',
        usage: 'POST with ?entity=all|bookings|rooms'
    });
}
