/**
 * Audit: Find all bookings where source='BEDS24' but they have Stripe payment data,
 * indicating they were actually website bookings that got overwritten by the webhook.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find bookings that look like website bookings but have source BEDS24
  const corrupted = await prisma.booking.findMany({
    where: {
      OR: [
        // Has Stripe data but source is BEDS24
        { source: 'BEDS24', stripeDepositId: { not: null } },
        { source: 'BEDS24', stripeCustomerId: { not: null } },
        { source: 'BEDS24', stripePaymentMethodId: { not: null } },
        { source: 'BEDS24', stripePaymentIntentId: { not: null } },
        { source: 'BEDS24', depositAmount: { not: null, gt: 0 } },
        { source: 'BEDS24', paymentMethod: 'card' },
        // Notes say "Updated via Webhook" but has deposit data
        { notes: { contains: 'Updated via Webhook' }, depositAmount: { not: null, gt: 0 } },
      ],
    },
    include: { room: { select: { name: true } } },
    orderBy: { checkIn: 'asc' },
  });

  console.log('═'.repeat(100));
  console.log(`CORRUPTED WEBSITE BOOKINGS (source overwritten to BEDS24): ${corrupted.length} found`);
  console.log('═'.repeat(100));

  for (const b of corrupted) {
    const issues = [];
    if (b.source === 'BEDS24') issues.push('source=BEDS24');
    if (b.notes?.includes('Updated via Webhook')) issues.push('notes overwritten');
    if (b.numAdults === 1 && b.numChildren === 0) issues.push('guest counts likely wrong (1+0)');
    if (!b.guestEmail) issues.push('email missing');

    console.log(`\n${b.id}`);
    console.log(`  Guest: ${b.guestName} | Email: ${b.guestEmail || 'NONE'}`);
    console.log(`  Room: ${b.room?.name || 'N/A'} | ${b.checkIn?.toISOString().split('T')[0]} → ${b.checkOut?.toISOString().split('T')[0]}`);
    console.log(`  Source: ${b.source} | Status: ${b.status} | Payment: ${b.paymentStatus}`);
    console.log(`  Deposit: ${b.depositAmount} | Balance: ${b.balanceAmount} | Stripe: ${b.stripeDepositId || b.stripePaymentIntentId || 'NONE'}`);
    console.log(`  Adults: ${b.numAdults} | Children: ${b.numChildren} | Notes: ${(b.notes || '').substring(0, 60)}`);
    console.log(`  ISSUES: ${issues.join(' | ')}`);
  }

  // Also find bookings with source=Website that have correct data (for comparison)
  const websiteOk = await prisma.booking.findMany({
    where: { source: 'Website' },
    select: { id: true, guestName: true, guestEmail: true, checkIn: true, status: true },
    orderBy: { checkIn: 'asc' },
  });

  console.log('\n' + '═'.repeat(100));
  console.log(`CORRECTLY SOURCED WEBSITE BOOKINGS: ${websiteOk.length} found`);
  console.log('═'.repeat(100));
  for (const b of websiteOk) {
    console.log(`  ${b.guestName} | ${b.guestEmail || 'no email'} | ${b.checkIn?.toISOString().split('T')[0]} | ${b.status}`);
  }

  await prisma.$disconnect();
}

main();
