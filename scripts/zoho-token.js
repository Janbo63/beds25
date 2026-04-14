const fs = require('fs');
require('dotenv').config();

async function run() {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', process.env.ZOHO_CLIENT_ID);
    params.append('client_secret', process.env.ZOHO_CLIENT_SECRET);
    params.append('code', '1000.8fbea809219e8fd48d7487607a3dbba3.53829164e51885b544139475b6ec0211');

    console.log('Fetching Zoho token...');
    const response = await fetch('https://accounts.zoho.eu/oauth/v2/token?' + params.toString(), { method: 'POST' });
    const data = await response.json();
    console.log(data);

    if (data.refresh_token) {
        fs.appendFileSync('.env', '\nZOHO_REFRESH_TOKEN="' + data.refresh_token + '"');
        console.log('Saved ZOHO_REFRESH_TOKEN to .env! (Warning: if it already existed, you may need to clean up duplicates)');
    } else {
        console.error('No refresh token found. Maybe the code expired?');
    }
}

run().catch(console.error);
