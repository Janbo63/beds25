import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { importBeds24Data } from '../src/lib/beds24';

const prisma = new PrismaClient();

async function sweep() {
    console.log('Wiping local bookings to force a deeply clean reconciliation round...');
    await prisma.booking.deleteMany({});
    console.log('Local bookings deleted. Initiating Beds24 Import and Zoho merge...');

    const res = await importBeds24Data('', process.env.BEDS24_REFRESH_TOKEN);
    console.log('Sweep complete. Upserted:', res.bookings?.upserted || 0, 'Zoho Synced:', res.zohoSync);
}

sweep().then(() => process.exit(0)).catch(console.error);
