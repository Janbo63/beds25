// Quick script to dump all active bookings from Beds25 database
// Run: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/dump-bookings.ts

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
            externalId: true,   // Beds24 ID
            zohoId: true,       // Zoho CRM ID
            source: true,
            room: { select: { name: true, number: true } },
        },
        orderBy: { checkIn: 'asc' },
    });

    console.log(`\n=== BEDS25 DATABASE: ${bookings.length} bookings ===\n`);
    console.log('Guest | CheckIn | Status | Beds24ID (externalId) | ZohoID | Room | Source');
    console.log('-'.repeat(120));
    
    for (const b of bookings) {
        const checkIn = b.checkIn.toISOString().slice(0, 10);
        const checkOut = b.checkOut.toISOString().slice(0, 10);
        console.log(
            `${(b.guestName || '').padEnd(25)} | ${checkIn}→${checkOut} | ${(b.status || '').padEnd(15)} | beds24:${(b.externalId || 'NONE').padEnd(12)} | zoho:${(b.zohoId || 'NONE').padEnd(22)} | ${(b.room?.number || b.room?.name || '?').padEnd(6)} | ${b.source}`
        );
    }
    
    // Show duplicates by externalId
    const byExternal = new Map();
    for (const b of bookings) {
        if (!b.externalId) continue;
        const arr = byExternal.get(b.externalId) || [];
        arr.push(b);
        byExternal.set(b.externalId, arr);
    }
    
    const dupes = [...byExternal.entries()].filter(([, arr]) => arr.length > 1);
    if (dupes.length > 0) {
        console.log(`\n=== DUPLICATES by Beds24 ID: ${dupes.length} groups ===`);
        for (const [extId, arr] of dupes) {
            console.log(`\nBeds24 ID ${extId}:`);
            for (const b of arr) {
                console.log(`  - beds25id: ${b.id}, guest: ${b.guestName}, status: ${b.status}, zoho: ${b.zohoId || 'NONE'}`);
            }
        }
    } else {
        console.log('\n=== NO DUPLICATES by Beds24 ID ===');
    }
    
    // Show records where id looks like a Zoho ID (19-digit number) — Bug #2 artifacts
    const zohoIdRecords = bookings.filter(b => /^\d{15,}$/.test(b.id));
    if (zohoIdRecords.length > 0) {
        console.log(`\n=== BUG #2 ARTIFACTS: ${zohoIdRecords.length} records where Beds25 id = Zoho ID ===`);
        for (const b of zohoIdRecords) {
            console.log(`  - id: ${b.id}, guest: ${b.guestName}, beds24: ${b.externalId || 'NONE'}, zoho: ${b.zohoId || 'NONE'}`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
