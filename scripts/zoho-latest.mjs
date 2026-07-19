const api = 'https://www.zohoapis.eu';
const params = new URLSearchParams({refresh_token:'1000.6a78ff23062b000ecbdd95291beb9a1e.2139ac2fa781358bc0c16251a4dc79ff',client_id:'1000.1PDETWWBOOE6URRHT2E9AGFWQUVRIT',client_secret:'c55665642e60ccd73cadac2d38d9309fbdf8ae4240',grant_type:'refresh_token'});

async function main() {
  const tokenRes = await fetch('https://accounts.zoho.eu/oauth/v2/token?'+params,{method:'POST'});
  const tokenData = await tokenRes.json();
  const t = tokenData.access_token;

  // Get latest 15 bookings ordered by creation time
  const q = "select Name, Guest, Check_In, Check_Out, Room, Booking_status, Payment_status, Beds24ID, Beds25ID, Channel, Total_Price, Created_Time from Bookings order by Created_Time desc limit 15";
  const r = await fetch(api+'/crm/v6/coql',{method:'POST',headers:{'Authorization':'Zoho-oauthtoken '+t,'Content-Type':'application/json'},body:JSON.stringify({select_query:q})});
  const data = await r.json();
  
  console.log('LATEST ZOHO BOOKINGS (newest first)\n');
  console.log('NAME       CREATED           ROOM                 GUEST                     CHANNEL    STATUS       B24ID       B25ID');
  console.log('─'.repeat(140));
  
  for (const b of (data.data||[])) {
    const room = b.Room ? (b.Room.name || b.Room.id) : '❌ NO ROOM';
    const guest = b.Guest ? (b.Guest.name || b.Guest.id) : 'No guest link';
    const created = (b.Created_Time || '').substring(0, 16);
    const b24 = b.Beds24ID || 'none';
    const b25 = b.Beds25ID ? b.Beds25ID.substring(0, 12) + '...' : 'none';
    console.log(
      (b.Name||'').padEnd(10),
      created.padEnd(18),
      room.padEnd(20),
      guest.padEnd(25),
      (b.Channel||'-').padEnd(10),
      (b.Booking_status||'-').padEnd(12),
      b24.padEnd(12),
      b25
    );
  }
}

main().catch(console.error);
