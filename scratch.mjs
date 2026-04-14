import 'dotenv/config';

async function testZoho() {
    const tokenUrl = `https://accounts.zoho.eu/oauth/v2/token`;
    const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
    });

    const tokenRes = await fetch(`${tokenUrl}?${params.toString()}`, { method: 'POST' });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    const res = await fetch(`https://www.zohoapis.eu/crm/v6/settings/fields?module=Bookings`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    });
    const data = await res.json();
    
    if (data.fields) {
        console.log("Zoho Bookings Module Fields Available:");
        console.log(data.fields.map(f => f.api_name).join(', '));
    } else {
        console.log(data);
    }
}

testZoho();
