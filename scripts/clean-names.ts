import { PrismaClient } from '@prisma/client';
import { fetchSingleBeds24Booking, getBeds24AccessToken, fetchBeds24Bookings } from './src/lib/beds24';

const prisma = new PrismaClient();

async function cleanAllNames() {
  // Get all bookings with their current data
  const allBookings = await prisma.booking.findMany({
    include: { room: true },
    orderBy: { checkIn: 'asc' }
  });

  console.log(`\n=== FULL NAME CLEANUP: ${allBookings.length} bookings ===\n`);

  // Get Beds24 access token
  const property = await prisma.property.findFirst({
    where: { beds24RefreshToken: { not: null } }
  });

  if (!property?.beds24RefreshToken) {
    console.error('No Beds24 refresh token found');
    return;
  }

  const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);

  // Fetch ALL bookings from Beds24 to build a name lookup map
  console.log('Fetching all bookings from Beds24 API...');
  const beds24Bookings = await fetchBeds24Bookings(accessToken);
  console.log(`Got ${beds24Bookings.length} bookings from Beds24`);

  // Build lookup: externalId -> { firstName, lastName }
  const nameMap = new Map<string, { firstName: string; lastName: string; email: string }>();
  for (const b of beds24Bookings) {
    const id = (b.id || b.bookId || '').toString();
    if (id) {
      nameMap.set(id, {
        firstName: b.firstName || '',
        lastName: b.lastName || '',
        email: b.email || '',
      });
    }
  }

  let fixed = 0;
  let already_correct = 0;
  let not_found_in_beds24 = 0;

  for (const booking of allBookings) {
    const extId = booking.externalId;
    if (!extId) continue;

    const beds24Data = nameMap.get(extId);
    if (!beds24Data) {
      not_found_in_beds24++;
      continue;
    }

    const correctName = `${beds24Data.firstName} ${beds24Data.lastName}`.trim() || 'Guest';
    const currentName = booking.guestName || '';

    if (currentName === correctName) {
      already_correct++;
      continue;
    }

    // Fix it!
    console.log(`  FIX: "${currentName}" → "${correctName}" (booking ${extId})`);
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        guestName: correctName,
        guestEmail: beds24Data.email || booking.guestEmail || '',
      }
    });
    fixed++;
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Already correct: ${already_correct}`);
  console.log(`  Not in Beds24: ${not_found_in_beds24}`);
  console.log(`  Total: ${allBookings.length}`);

  // Now run a full Zoho sync to propagate
  if (fixed > 0) {
    console.log(`\nRunning Zoho sync to propagate ${fixed} name fixes...`);
    const { importBeds24Data } = await import('./src/lib/beds24');
    // Use test_sync approach - just trigger the zoho sync
    const { bookingService } = await import('./src/lib/zoho-service');
    const updatedBookings = await prisma.booking.findMany({ include: { room: true } });
    let synced = 0;
    let failed = 0;
    for (const b of updatedBookings) {
      try {
        await bookingService.syncToZoho(b, b.room);
        synced++;
      } catch (err: any) {
        console.warn(`  Zoho sync failed for ${b.bookingRef}: ${err?.message}`);
        failed++;
      }
    }
    console.log(`  Zoho sync: ${synced} synced, ${failed} failed`);
  }
}

cleanAllNames().catch(console.error).finally(() => prisma.$disconnect());
