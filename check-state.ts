import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkState() {
  console.log("=== LATEST WEBHOOK LOGS ===");
  const logs = await prisma.webhookLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(logs, null, 2));

  console.log("\n=== LATEST BOOKINGS IN DB ===");
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { room: { select: { number: true, name: true } } }
  });
  console.log(JSON.stringify(bookings, null, 2));

  console.log("\n=== ALL BOOKINGS FOR 84569062 ===");
  const b84569062 = await prisma.booking.findMany({
    where: { externalId: '84569062' }
  });
  console.log(JSON.stringify(b84569062, null, 2));

  console.log("\n=== ALL BOOKINGS FOR 84577654 ===");
  const b84577654 = await prisma.booking.findMany({
    where: { externalId: '84577654' }
  });
  console.log(JSON.stringify(b84577654, null, 2));
}

checkState().catch(console.error).finally(() => prisma.$disconnect());
