import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { bookingService } from '../src/lib/zoho-service';

const prisma = new PrismaClient();

async function run() {
    try {
        const startDate = new Date('2026-01-01T00:00:00Z');
        
        const bookings = await prisma.booking.findMany({
            where: {
                checkIn: { gte: startDate }
            },
            include: { room: true }
        });

        console.log(`Starting historical sync for ${bookings.length} bookings checking in from 2026 onwards...`);

        let success = 0;
        let failed = 0;

        for (const booking of bookings) {
            try {
                if (!booking.room) {
                    console.log(`Skipping booking ${booking.id} because it has no room associated.`);
                    continue;
                }
                
                await bookingService.syncToZoho(booking, booking.room);
                success++;
                
                // Be gentle with Zoho API rate limits
                await new Promise(res => setTimeout(res, 200));
            } catch (err: any) {
                console.error(`Failed to sync booking ${booking.id}:`, err.message);
                failed++;
            }
        }

        console.log(`\nSync complete! Success: ${success}, Failed: ${failed}`);
        process.exit(0);
    } catch (e) {
        console.error("Fatal error during sync:", e);
        process.exit(1);
    }
}

run();
