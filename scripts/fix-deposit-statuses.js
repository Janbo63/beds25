/**
 * Production Status Fix Script
 * 
 * Fixes 4 bookings whose DEPOSIT_PAID status was overwritten to CONFIRMED
 * by the Beds24 webhook echo-back bug (now patched in b610e01).
 * 
 * Run on the Hostinger VPS after deployment:
 *   cd /var/www/beds25 && node scripts/fix-deposit-statuses.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BOOKINGS_TO_FIX = [
  {
    id: 'cms8qjp9z0000jmstope86emn',
    guest: 'Kamila Kozaczyk',
    zohoId: 'ZBo1602',
    checkIn: 'Aug 14',
    balance: 558,
    targetStatus: 'DEPOSIT_PAID',
  },
  {
    id: 'cmq5bclp20001jmwn40zv5z0x',
    guest: 'natalia.brzezny@gmail.com',
    zohoId: 'ZBo1560',
    checkIn: 'Aug 9',
    balance: 891,
    targetStatus: 'DEPOSIT_PAID',
  },
  {
    id: 'cmrhsowv70007jmhxfhjm8b79',
    guest: 'oliwa84@wp.pl',
    zohoId: 'ZBo1570',
    checkIn: 'Aug 3',
    balance: 1116,
    targetStatus: 'DEPOSIT_PAID',
  },
  {
    id: 'cmq6nw6ey0003jmevls76yzto',
    guest: 'Mekmann03@gmail.com',
    zohoId: 'ZBo1563',
    checkIn: 'Jul 28',
    balance: 1107,
    targetStatus: 'DEPOSIT_PAID',  // Will only update if not already FULLY_PAID
  },
];

async function main() {
  console.log('═'.repeat(80));
  console.log('PRODUCTION STATUS FIX — Correcting DEPOSIT_PAID statuses');
  console.log('═'.repeat(80));
  console.log('');

  for (const fix of BOOKINGS_TO_FIX) {
    const booking = await prisma.booking.findUnique({ where: { id: fix.id } });

    if (!booking) {
      console.log(`❌ ${fix.guest} (${fix.zohoId}): Booking ${fix.id} NOT FOUND in local DB`);
      continue;
    }

    console.log(`📋 ${fix.guest} (${fix.zohoId})`);
    console.log(`   Current status: ${booking.status} | Payment: ${booking.paymentStatus}`);
    console.log(`   Check-in: ${fix.checkIn} | Balance: ${fix.balance} PLN`);

    // Don't downgrade if already in a later payment state
    if (['FULLY_PAID', 'BALANCE_PENDING'].includes(booking.status)) {
      console.log(`   ✅ Already in ${booking.status} — no change needed`);
      console.log('');
      continue;
    }

    if (booking.status === fix.targetStatus) {
      console.log(`   ✅ Already ${fix.targetStatus} — no change needed`);
      console.log('');
      continue;
    }

    // Fix the status
    await prisma.booking.update({
      where: { id: fix.id },
      data: {
        status: fix.targetStatus,
        paymentStatus: 'partial',
      },
    });

    console.log(`   🔧 FIXED: ${booking.status} → ${fix.targetStatus}`);
    console.log('');
  }

  // Also sync the corrected statuses to Zoho
  console.log('─'.repeat(80));
  console.log('Syncing corrected statuses to Zoho CRM...');

  try {
    const { bookingService } = require('../src/lib/zoho-service');

    for (const fix of BOOKINGS_TO_FIX) {
      const booking = await prisma.booking.findUnique({
        where: { id: fix.id },
        include: { room: true },
      });

      if (booking && booking.room && booking.status === 'DEPOSIT_PAID') {
        try {
          await bookingService.syncToZoho(booking, booking.room);
          console.log(`   ✅ Zoho synced: ${fix.guest}`);
        } catch (err) {
          console.error(`   ⚠️ Zoho sync failed for ${fix.guest}:`, err.message);
        }
      }
    }
  } catch (importErr) {
    console.log('   ⚠️ Cannot import zoho-service directly (expected in production build).');
    console.log('   → Trigger a manual sync from the dashboard after this script completes.');
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('DONE — The balance auto-charge cron will now pick up these bookings.');
  console.log('═'.repeat(80));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
