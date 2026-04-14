import 'dotenv/config';
import zohoClient from '../src/lib/zoho';

async function cleanZoho() {
    console.log('Fetching all Bookings from Zoho CRM...');
    const result = await zohoClient.getRecords('Bookings', { fields: ['id', 'Room', 'Beds24ID', 'Modified_Time'], per_page: 200 });
    
    if (!result.data || result.data.length === 0) {
        console.log('No bookings found in Zoho.');
        return;
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
            // sort by Modified_Time desc
            group.sort((a, b) => new Date(b.Modified_Time).getTime() - new Date(a.Modified_Time).getTime());
            // drop the first (newest), add rest to delete array
            const extras = group.slice(1);
            extras.forEach(e => {
                if (!toDelete.includes(e.id)) toDelete.push(e.id);
            });
        }
    }

    console.log(`Found ${toDelete.length} broken/duplicate bookings to delete in Zoho.`);
    
    // Chunk deletions by 100
    const chunkSize = 100;
    for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        console.log(`Deleting chunk of ${chunk.length}...`);
        await zohoClient.request('DELETE', `/Bookings?ids=${chunk.join(',')}`);
    }

    console.log('Done cleaning Zoho! Now, run "Force Re-Sync All" button on UI.');
}

cleanZoho().then(() => process.exit(0)).catch(console.error);
