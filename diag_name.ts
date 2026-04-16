import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // Find booking by ref or by searching recent bookings
  const booking = await p.booking.findFirst({
    where: { bookingRef: 'ZBo1537' },
    include: { guest: true, room: true }
  });

  if (!booking) {
    // Try searching by externalId-like pattern or just get recent
    const recent = await p.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { guest: true, room: true }
    });
    console.log('No booking with ref ZBo1537 found. Recent 5:');
    for (const r of recent) {
      console.log(`  ${r.bookingRef || r.externalId} | "${r.guestName}" | email: ${r.guestEmail} | room: ${r.room?.name}`);
    }
    return;
  }

  console.log('FOUND booking ZBo1537:');
  console.log(`  guestName: "${booking.guestName}"`);
  console.log(`  guestEmail: "${booking.guestEmail}"`);
  console.log(`  externalId: ${booking.externalId}`);
  console.log(`  source: ${booking.source}`);
  console.log(`  room: ${booking.room?.name}`);
  if (booking.guest) {
    console.log(`  Guest record: name="${booking.guest.name}" firstName="${booking.guest.firstName}" lastName="${booking.guest.lastName}"`);
  }

  // Also check webhook logs for this booking
  const logs = await p.webhookLog.findMany({
    where: { externalId: booking.externalId },
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  for (const l of logs) {
    console.log(`  WebhookLog: ${l.event} ${l.status} payload=${l.payload?.substring(0, 300)}`);
  }
}
main().catch(console.error);
