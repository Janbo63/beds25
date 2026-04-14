import { PrismaClient } from '@prisma/client';
import { fetchBeds24Bookings } from './src/lib/beds24';
import { getBeds24AccessToken } from './src/app/api/admin/beds24/import/route'; // this is internal, wait, let's just do it directly
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function main() {
    const prop = await prisma.property.findFirst({ where: { beds24RefreshToken: { not: null } } });
    const res = await fetch('https://api.beds24.com/v2/authentication/token', {
        headers: { refreshToken: prop.beds24RefreshToken }
    });
    const { token } = await res.json();
    
    const bookings = await fetchBeds24Bookings(token);
    
    const targetIds = ['84947664', '84947663'];
    const b24Targets = bookings.filter((b: any) => targetIds.includes(b.id?.toString()));
    
    console.log('Found targets from Beds24 API:', JSON.stringify(b24Targets, null, 2));

    for (const b of b24Targets) {
        const localRoom = await prisma.room.findUnique({
            where: { externalId: b.roomId?.toString() }
        });
        console.log(`Booking ${b.id} -> roomId: ${b.roomId} -> localRoom found? ${!!localRoom}`);
        
        const localBooking = await prisma.booking.findUnique({
            where: { externalId: b.id?.toString() }
        });
        console.log(`Booking ${b.id} -> exists locally? ${!!localBooking}`);
    }
}

main().catch(console.error);
