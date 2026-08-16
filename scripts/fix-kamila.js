const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function find() {
  // Search broadly
  const all = await p.booking.findMany({
    where: {
      checkIn: { gte: new Date('2026-08-14'), lte: new Date('2026-08-15') },
    },
    include: { room: true }
  });
  console.log('All bookings checking in Aug 14-15:', all.length);
  for (const b of all) {
    console.log('  ID:', b.id, 'Guest:', b.guestName, 'Room:', b.room ? b.room.name : 'N/A', 'Status:', b.status, 'zohoId:', b.zohoId, 'ext:', b.externalId);
  }

  // Also search by zohoId
  const z = await p.booking.findFirst({ where: { zohoId: '884394000001896001' } });
  console.log('\nBy zohoId 884394000001896001:', z ? z.id + ' ' + z.guestName : 'NOT FOUND');

  // Search by externalId (Beds24)
  const e = await p.booking.findFirst({ where: { externalId: '90722413' } });
  console.log('By externalId 90722413:', e ? e.id + ' ' + e.guestName : 'NOT FOUND');

  // Search for any Kozaczyk
  const k = await p.booking.findMany({ where: { guestName: { contains: 'Kozaczyk' } } });
  console.log('By name Kozaczyk:', k.length);

  // Search for recent creates
  const recent = await p.booking.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { room: true }
  });
  console.log('\n5 most recent bookings:');
  for (const b of recent) {
    console.log('  ID:', b.id, 'Guest:', b.guestName, 'Created:', b.createdAt, 'Room:', b.room ? b.room.name : 'N/A', 'zohoId:', b.zohoId);
  }

  await p.$disconnect();
}
find();
