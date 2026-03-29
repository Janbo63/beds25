// Quick script to dump all active bookings from Beds25 database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const bookings = await prisma.booking.findMany({
        where: {
            checkIn: { gte: new Date('2025-01-01') },
        },
        select: {
            id: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
            status: true,
            externalId: true,
            zohoId: true,
            source: true,
            room: { select: { name: true, number: true } },
        },
        orderBy: { checkIn: 'asc' },
    });

    console.log(`\n=== BEDS25 DATABASE: ${bookings.length} bookings ===\n`);
    console.log('Guest | CheckIn | CheckOut | Status | Beds24ID | ZohoID | Room | Source | Beds25ID');
    console.log('-'.repeat(180));
    
    for (const b of bookings) {
        const ci = b.checkIn.toISOString().slice(0, 10);
        const co = b.checkOut.toISOString().slice(0, 10);
        console.log(
            `${(b.guestName || '').padEnd(25)} | ${ci} | ${co} | ${(b.status || '').padEnd(15)} | ${(b.externalId || 'NONE').padEnd(12)} | ${(b.zohoId || 'NONE').padEnd(22)} | ${(b.room?.number || '?').padEnd(4)} | ${(b.source || '').padEnd(12)} | ${b.id}`
        );
    }
    
    // Show duplicates by guest+dates+room
    const grouped = {};
    for (const b of bookings) {
        if (b.status === 'CANCELLED') continue;
        const ci = b.checkIn.toISOString().slice(0,10);
        const co = b.checkOut.toISOString().slice(0,10);
        const key = `${(b.guestName||'').toLowerCase().trim()}|${ci}|${co}|${b.room?.number||''}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(b);
    }
    
    const dupes = Object.entries(grouped).filter(([,arr]) => arr.length > 1);
    if (dupes.length > 0) {
        console.log(`\n=== DUPLICATES (same guest+dates+room, non-cancelled): ${dupes.length} groups ===`);
        for (const [key, arr] of dupes) {
            console.log(`\nGroup: ${key}`);
            for (const b of arr) {
                console.log(`  beds25id: ${b.id} | beds24: ${b.externalId || 'NONE'} | zoho: ${b.zohoId || 'NONE'} | status: ${b.status}`);
            }
        }
    } else {
        console.log('\n=== NO DUPLICATES (same guest+dates+room) ===');
    }
    
    // Bug #2 artifacts
    const zohoIds = bookings.filter(b => /^\d{15,}$/.test(b.id));
    if (zohoIds.length > 0) {
        console.log(`\n=== BUG #2 ARTIFACTS: ${zohoIds.length} records where Beds25 id looks like Zoho ID ===`);
        for (const b of zohoIds) {
            console.log(`  id(zoho?): ${b.id} | guest: ${b.guestName} | beds24: ${b.externalId || 'NONE'} | zoho: ${b.zohoId || 'NONE'} | status: ${b.status}`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
