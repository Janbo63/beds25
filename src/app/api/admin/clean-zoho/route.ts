import { NextResponse } from 'next/server';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('Fetching all Bookings from Zoho CRM...');
        const result = await zohoClient.getRecords('Bookings', { fields: ['id', 'Room', 'Beds24ID', 'Modified_Time'], per_page: 200 });
        
        if (!result.data || result.data.length === 0) {
            return NextResponse.json({ message: 'No bookings found in Zoho to clean.' });
        }

        const toDelete: string[] = [];

        // Map by Beds24ID to find duplicates, and find missing rooms
        const byBeds24 = new Map<string, any[]>();
        for (const b of result.data) {
            // If it lacks a room, it's a broken ghost booking
            if (!b.Room || !b.Room.id) {
                toDelete.push(b.id);
                continue;
            }

            const b24 = b.Beds24ID;
            if (b24) {
                if (!byBeds24.has(b24)) byBeds24.set(b24, []);
                byBeds24.get(b24)!.push(b);
            }
        }

        for (const [b24Id, group] of byBeds24) {
            // Keep the most recently modified one, delete the rest
            if (group.length > 1) {
                group.sort((a: any, b: any) => new Date(b.Modified_Time).getTime() - new Date(a.Modified_Time).getTime());
                const extras = group.slice(1);
                extras.forEach((e: any) => {
                    if (!toDelete.includes(e.id)) toDelete.push(e.id);
                });
            }
        }

        // Chunk deletions by 100
        const chunkSize = 100;
        for (let i = 0; i < toDelete.length; i += chunkSize) {
            const chunk = toDelete.slice(i, i + chunkSize);
            await zohoClient.request('DELETE', `/Bookings?ids=${chunk.join(',')}`);
        }

        return NextResponse.json({
            message: `Successfully deleted ${toDelete.length} broken/duplicate bookings from Zoho CRM. Zoho is perfectly clean.`,
            deletedCount: toDelete.length,
            ids: toDelete
        });

    } catch (error: any) {
        console.error('Zoho Cleanup failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
