import { importBeds24Data } from './src/lib/beds24';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const prop = await prisma.property.findFirst({ where: { beds24RefreshToken: { not: null } } });
    if (!prop) throw new Error('No prop');
    console.log('Starting massive beds24 sync simulation...');
    try {
        const results = await importBeds24Data('', prop.beds24RefreshToken!);
        console.log('Force Sync Complete!', results);
    } catch (e: any) {
        console.error('Crash during Force Sync:', e.message);
    }
}
main().catch(console.error);
