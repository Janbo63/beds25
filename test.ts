import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const r1 = await prisma.room.findFirst({ where: { externalId: '223648' } });
  const r2 = await prisma.room.findFirst({ where: { externalId: '223647' } });
  console.log('Room 223648 found:', !!r1);
  console.log('Room 223647 found:', !!r2);

  const testBooking = await prisma.booking.findFirst({ where: { externalId: '84947664' } });
  console.log('Booking 84947664 locally found?', !!testBooking);
}
main().catch(console.error);
