// Quick script to query Zoho Bookings module metadata
// Usage: node scripts/zoho-fields.mjs

const ZOHO_CLIENT_ID = '1000.1PDETWWBOOE6URRHT2E9AGFWQUVRIT';
const ZOHO_CLIENT_SECRET = 'c55665642e60ccd73cadac2d38d9309fbdf8ae4240';
const ZOHO_REFRESH_TOKEN = '1000.6a78ff23062b000ecbdd95291beb9a1e.2139ac2fa781358bc0c16251a4dc79ff';
const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.eu';
const ZOHO_API_DOMAIN = 'https://www.zohoapis.eu';

async function getAccessToken() {
    const params = new URLSearchParams({
        refresh_token: ZOHO_REFRESH_TOKEN,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
    });
    const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token?${params}`, { method: 'POST' });
    const data = await res.json();
    if (!data.access_token) throw new Error(`Token failed: ${JSON.stringify(data)}`);
    return data.access_token;
}

async function main() {
    const token = await getAccessToken();
    console.log('✅ Got access token\n');

    // 1. Get Bookings module field metadata
    console.log('═══════════════════════════════════════════');
    console.log('  ZOHO BOOKINGS MODULE — ALL FIELDS');
    console.log('═══════════════════════════════════════════\n');

    const fieldsRes = await fetch(`${ZOHO_API_DOMAIN}/crm/v6/settings/fields?module=Bookings`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    });
    const fieldsData = await fieldsRes.json();
    
    if (!fieldsData.fields) {
        console.error('No fields returned:', JSON.stringify(fieldsData));
        return;
    }

    // Group by section
    const sections = {};
    for (const f of fieldsData.fields) {
        const section = f.section_name || 'Other';
        if (!sections[section]) sections[section] = [];
        sections[section].push({
            api_name: f.api_name,
            display_label: f.display_label || f.field_label,
            data_type: f.data_type,
            custom: f.custom_field || false,
        });
    }

    for (const [section, fields] of Object.entries(sections)) {
        console.log(`\n── ${section} ──`);
        for (const f of fields) {
            const tag = f.custom ? ' [CUSTOM]' : '';
            console.log(`  ${f.api_name.padEnd(35)} ${f.data_type.padEnd(12)} "${f.display_label}"${tag}`);
        }
    }

    // 2. Search for Stripe/deposit/payment fields specifically
    console.log('\n\n═══════════════════════════════════════════');
    console.log('  STRIPE / PAYMENT / DEPOSIT FIELDS');
    console.log('═══════════════════════════════════════════\n');

    const paymentFields = fieldsData.fields.filter(f => {
        const name = (f.api_name + ' ' + (f.display_label || '')).toLowerCase();
        return name.includes('stripe') || name.includes('deposit') || name.includes('balance') || name.includes('payment');
    });

    if (paymentFields.length === 0) {
        console.log('❌ NO Stripe/deposit/payment fields found in Bookings module!');
    } else {
        for (const f of paymentFields) {
            console.log(`  ${f.api_name.padEnd(35)} ${f.data_type.padEnd(12)} "${f.display_label}" ${f.custom_field ? '[CUSTOM]' : ''}`);
        }
    }

    // 3. Look at a sample booking record (Natalia's)
    console.log('\n\n═══════════════════════════════════════════');
    console.log('  NATALIA\'S BOOKING (ZBo1560)');
    console.log('═══════════════════════════════════════════\n');

    try {
        const query = `select Name, Guest_Name, Check_In, Check_Out, Room, Booking_status, Payment_Status, Payment_Method, Beds24ID, Beds25ID, Total_Price, Deposit_Amount, Balance_Amount, Channel from Bookings where Name = 'Zbt1560' limit 1`;
        const searchRes = await fetch(`${ZOHO_API_DOMAIN}/crm/v6/coql`, {
            method: 'POST',
            headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ select_query: query })
        });
        const searchData = await searchRes.json();
        if (searchData.data && searchData.data.length > 0) {
            console.log(JSON.stringify(searchData.data[0], null, 2));
        } else {
            console.log('Not found by Zbt1560, trying broader search...');
            const query2 = `select Name, Guest_Name, Check_In, Check_Out, Room, Booking_status, Payment_Status, Beds24ID, Beds25ID, Total_Price from Bookings where Guest_Name like '%Natalia%' limit 5`;
            const res2 = await fetch(`${ZOHO_API_DOMAIN}/crm/v6/coql`, {
                method: 'POST',
                headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ select_query: query2 })
            });
            const data2 = await res2.json();
            console.log(JSON.stringify(data2.data || data2, null, 2));
        }
    } catch (err) {
        console.log('Search error:', err.message);
    }
}

main().catch(console.error);
