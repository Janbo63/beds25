const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Clearing database...');
    await prisma.booking.deleteMany();
    await prisma.room.deleteMany();
    await prisma.property.deleteMany();

    console.log('Seeding properties and rooms...');
    await prisma.property.create({
        data: {
            name: 'Zagroda Alpakoterapii',
            description: 'Luksusowe noclegi wśród alpak.',
            address: 'Alpakowa 1, 00-001 Wieś',
            rooms: {
                create: [
                    { number: '101', name: 'Alpaca Suite Deluxe', basePrice: 350.0, capacity: 2 },
                    { number: '102', name: 'Garden View Room', basePrice: 240.0, capacity: 2 },
                    { number: '103', name: 'Premium Studio', basePrice: 290.0, capacity: 2 },
                    { number: '201', name: 'Family Loft', basePrice: 480.0, capacity: 4 },
                    { number: '202', name: 'Single Standard', basePrice: 150.0, capacity: 1 }
                ]
            }
        }
    });

    const rooms = await prisma.room.findMany();

    console.log('Seeding bookings...');
    await prisma.booking.createMany({
        data: [
            {
                roomId: rooms[0].id,
                guestName: 'John Doe',
                checkIn: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                checkOut: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                totalPrice: 1400.0,
                status: 'CONFIRMED',
                source: 'BOOKING.COM'
            },
            {
                roomId: rooms[1].id,
                guestName: 'Alice Smith',
                checkIn: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
                checkOut: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
                totalPrice: 720.0,
                status: 'CONFIRMED',
                source: 'AIRBNB'
            }
        ]
    });

    console.log('✅ Database fully restored with fresh sample data.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
