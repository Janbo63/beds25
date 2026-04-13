import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Max execution time for vercel/hostinger

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year') || '2026';
        
        // Find bookings checking in from Jan 1st of target year onwards
        const startDate = new Date(`${year}-01-01T00:00:00Z`);
        
        const bookings = await prisma.booking.findMany({
            where: {
                checkIn: { gte: startDate }
            },
            include: { room: true }
        });

        const results = {
            total: bookings.length,
            success: 0,
            failed: 0,
            errors: [] as string[]
        };

        for (const booking of bookings) {
            try {
                if (!booking.room) {
                    throw new Error(`Booking ${booking.id} has no associated room.`);
                }
                
                // Deep sync to Zoho
                await bookingService.syncToZoho(booking, booking.room);
                results.success++;
                
                // Minimal delay to prevent API rate limiting from Zoho
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (err: any) {
                console.error(`Status sync failed for booking ${booking.id}: ${err.message}`);
                results.failed++;
                results.errors.push(`ID: ${booking.id} - ${err.message}`);
            }
        }

        return NextResponse.json({ message: `Historical sync for >= ${year} complete`, results });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
