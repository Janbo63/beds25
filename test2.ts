import { PrismaClient } from '@prisma/client';
import { fetchBeds24Bookings } from './src/lib/beds24';

const prisma = new PrismaClient();

async function mapB(b: any, localRoom: any) {
    const guestName = `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.title || 'Guest';
    const guestEmail = b.email || null;
    let guestId = null;

    if (guestEmail) {
        const guest = await prisma.guest.upsert({
            where: { email: guestEmail },
            update: { name: guestName },
            create: { name: guestName, email: guestEmail }
        });
        guestId = guest.id;
    }

    const mapStatus = (s: any) => {
        const strStatus = s?.toString();
        switch (strStatus) {
            case '0': return 'CANCELLED';
            case '1': return 'CONFIRMED';
            case '2': return 'NEW';
            case '3': return 'REQUEST';
            case '4': return 'CONFIRMED';
            default: return 'CONFIRMED';
        }
    };

    console.log(`Upserting booking ${b.id} with roomId ${localRoom.id}`);

    try {
        const localBooking = await prisma.booking.upsert({
            where: { externalId: b.id?.toString() },
            update: {
                guestName, guestEmail, guestId,
                checkIn: new Date(b.arrival),
                checkOut: new Date(b.departure),
                status: mapStatus(b.status),
                source: b.apiSource || 'BEDS24',
                totalPrice: parseFloat(b.price || '0'),
                roomId: localRoom.id
            },
            create: {
                guestName, guestEmail, guestId,
                checkIn: new Date(b.arrival),
                checkOut: new Date(b.departure),
                status: mapStatus(b.status),
                source: b.apiSource || 'BEDS24',
                totalPrice: parseFloat(b.price || '0'),
                externalId: b.id?.toString(),
                roomId: localRoom.id
            }
        });
        console.log('Saved successfully:', localBooking.id);
    } catch (e: any) {
        console.error('Save failed:', e.message);
    }
}

async function main() {
    const prop = await prisma.property.findFirst({ where: { beds24RefreshToken: { not: null } } });
    const res = await fetch('https://api.beds24.com/v2/authentication/token', {
        headers: { refreshToken: prop!.beds24RefreshToken! }
    });
    const { token } = await res.json();
    
    const bookings = await fetchBeds24Bookings(token);
    
    const b = bookings.find((bk: any) => bk.id?.toString() === '84947664');
    if (!b) return console.log('Beds24 API did not return 84947664');

    const localRoom = await prisma.room.findUnique({
        where: { externalId: b.roomId?.toString() }
    });
    if (!localRoom) return console.log('Local room missing');

    await mapB(b, localRoom);
}

main().catch(console.error);
