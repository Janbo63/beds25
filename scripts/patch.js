const fetch = require('node-fetch');

async function fix() {
    const ids = [
        '884394000001109001',
        '884394000001100001',
        '884394000001160005',
        '884394000001130001'
    ];

    for (const id of ids) {
        console.log(`Patching ${id}...`);
        const res = await fetch('http://localhost:3003/api/bookings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, zohoId: id })
        });
        const data = await res.json();
        console.log(`Result for ${id}:`, res.status, data.id ? 'Success' : data);
    }
}

fix();
