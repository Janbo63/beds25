const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
  const bookings = await p.booking.findMany({
    where: {
      checkIn: { lte: new Date('2026-08-30') },
      checkOut: { gte: new Date('2026-08-14') }
    },
    include: { room: true },
    orderBy: { checkIn: 'asc' }
  });

  console.log('Local bookings overlapping Aug 14-30:', bookings.length);
  for (const b of bookings) {
    console.log(
      b.id,
      b.guestName,
      b.checkIn.toISOString().slice(0, 10), '->',
      b.checkOut.toISOString().slice(0, 10),
      b.room ? b.room.name : 'N/A',
      'zoho:', b.zohoId || '-',
      'ext:', b.externalId || '-',
      'src:', b.source,
      'status:', b.status
    );
  }

  // Also look for Kamila specifically
  const kam = await p.booking.findMany({ where: { guestName: { contains: 'Kozaczyk' } } });
  console.log('\nKozaczyk bookings:', kam.length);
  for (const b of kam) {
    console.log('  ', b.id, b.guestName, b.checkIn, b.checkOut, 'zoho:', b.zohoId, 'ext:', b.externalId);
  }

  // Look for any booking with zohoId 884394000001896001
  const z = await p.booking.findFirst({ where: { zohoId: '884394000001896001' } });
  console.log('\nLocal booking with zohoId 884394000001896001:', z ? z.id + ' ' + z.guestName : 'NONE');

  // Look for any booking with zohoId 884394000001883002
  const z2 = await p.booking.findFirst({ where: { zohoId: '884394000001883002' } });
  console.log('Local booking with zohoId 884394000001883002:', z2 ? z2.id + ' ' + z2.guestName : 'NONE');

  await p.$disconnect();
}
check();
