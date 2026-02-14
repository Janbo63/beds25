import { NextRequest, NextResponse } from 'next/server';
import { bookingService, roomService, ZOHO_MODULES, mapRoomToZoho } from '@/lib/zoho-service';
import prisma from '@/lib/prisma';
import zohoClient from '@/lib/zoho';

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
        const action = searchParams.get('action') || 'pull'; // 'pull' or 'push_rooms'

        if (action === 'push_rooms') {
            // 1. Fetch all local rooms that have CUIDs (non-numeric)
            const localRooms = await prisma.room.findMany();
            const unsyncedRooms = localRooms.filter(r => !/^\d+$/.test(r.id));

            const pushedResults = [];

            for (const room of unsyncedRooms) {
                // Map to Zoho Format
                const zohoData = mapRoomToZoho(room);

                try {
                    const newRecord = await zohoClient.createRecord(ZOHO_MODULES.ROOMS, zohoData);
                    pushedResults.push({ oldId: room.id, newZohoId: newRecord.id, name: room.name });
                } catch (err: any) {
                    pushedResults.push({ oldId: room.id, error: err.message, name: room.name });
                }
            }

            return NextResponse.json({
                success: true,
                message: `Attempted to push ${unsyncedRooms.length} rooms to Zoho.`,
                details: pushedResults
            });
        }

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
            const roomsResponse = await roomService.syncFromZoho();
            results.synced.rooms = roomsResponse.data.length;
            results.debug = roomsResponse; // Return full debug info
            // Add explicit success message if count is 0 to verify it ran
            if (results.synced.rooms === 0) results.details = "Sync ran but found 0 rooms.";
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
