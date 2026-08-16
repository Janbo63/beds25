const ZOHO_CLIENT_ID = '1000.1PDETWWBOOE6URRHT2E9AGFWQUVRIT';
const ZOHO_CLIENT_SECRET = 'c55665642e60ccd73cadac2d38d9309fbdf8ae4240';
const ZOHO_REFRESH_TOKEN = '1000.6a78ff23062b000ecbdd95291beb9a1e.2139ac2fa781358bc0c16251a4dc79ff';

async function run() {
  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN, client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET, grant_type: 'refresh_token'
  });
  const res = await fetch('https://accounts.zoho.eu/oauth/v2/token?' + params, { method: 'POST' });
  const { access_token: token } = await res.json();

  // All August bookings
  const q = "select id, Name, Beds24ID, Beds25ID, Check_In, Check_Out, Booking_status, Channel, Created_Time, Room from Bookings where Check_In >= '2026-08-01' and Check_In <= '2026-08-31'";
  const r = await fetch('https://www.zohoapis.eu/crm/v6/coql', {
    method: 'POST',
    headers: { 'Authorization': 'Zoho-oauthtoken ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ select_query: q })
  });
  const data = await r.json();
  console.log('All Zoho bookings check-in August 2026:');
  if (data.data) {
    for (const b of data.data) {
      console.log('  ', b.id, b.Name, '|', b.Check_In, '->', b.Check_Out, '|', b.Room ? b.Room.id : 'NONE', '|', b.Channel, '|', b.Booking_status, '| B24:', b.Beds24ID || '-', '| B25:', b.Beds25ID || '-', '| Created:', b.Created_Time);
    }
  } else {
    console.log(JSON.stringify(data));
  }

  // Fetch full details of orphans via REST
  const orphans = ['884394000001883002', '884394000001896001'];
  for (const id of orphans) {
    const r2 = await fetch('https://www.zohoapis.eu/crm/v6/Bookings/' + id, {
      headers: { 'Authorization': 'Zoho-oauthtoken ' + token }
    });
    const d = await r2.json();
    const b = d.data ? d.data[0] : null;
    if (b) {
      console.log('\n=== ORPHAN', id, '===');
      console.log('  Name:', b.Name);
      console.log('  Dates:', b.Check_In, '->', b.Check_Out);
      console.log('  Room:', b.Room ? b.Room.name : 'NONE');
      console.log('  Channel:', b.Channel);
      console.log('  Status:', b.Booking_status);
      console.log('  Beds24ID:', b.Beds24ID || 'NONE');
      console.log('  Beds25ID:', b.Beds25ID || 'NONE');
      console.log('  Created:', b.Created_Time);
      console.log('  Owner:', b.Owner ? b.Owner.name : 'N/A');
      console.log('  Total_Price:', b.Total_Price);
      console.log('  Payment_status:', b.Payment_status);
      console.log('  Guest lookup:', b.Guest ? JSON.stringify(b.Guest) : 'NONE');
    }
  }
}
run();
