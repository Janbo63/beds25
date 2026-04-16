import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // Find webhook logs for the Tomasz booking (externalId 85423244)
  const logs = await p.webhookLog.findMany({
    where: {
      OR: [
        { externalId: '85423244' },
        { payload: { contains: '85423244' } },
        { payload: { contains: 'Tomasz' } },
        { payload: { contains: 'tfalko' } },
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  if (logs.length === 0) {
    console.log('No webhook logs found for booking 85423244. Checking most recent:');
    const recent = await p.webhookLog.findMany({
      where: { direction: 'INCOMING', source: 'BEDS24' },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    for (const r of recent) {
      console.log(`\n--- ${r.event} ${r.status} @ ${r.createdAt} ---`);
      console.log('externalId:', r.externalId);
      console.log('payload:', r.payload?.substring(0, 800));
      console.log('metadata:', r.metadata?.substring(0, 500));
    }
  } else {
    for (const l of logs) {
      console.log(`\n=== ${l.event} ${l.status} @ ${l.createdAt} ===`);
      console.log('externalId:', l.externalId);
      console.log('FULL payload:', l.payload);
      console.log('metadata:', l.metadata);
    }
  }
}
main().catch(console.error);
