const ZOHO_CLIENT_ID = '1000.1PDETWWBOOE6URRHT2E9AGFWQUVRIT';
const ZOHO_CLIENT_SECRET = 'c55665642e60ccd73cadac2d38d9309fbdf8ae4240';
const ZOHO_REFRESH_TOKEN = '1000.6a78ff23062b000ecbdd95291beb9a1e.2139ac2fa781358bc0c16251a4dc79ff';

async function getToken() {
  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN, client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET, grant_type: 'refresh_token'
  });
  const res = await fetch('https://accounts.zoho.eu/oauth/v2/token?' + params, { method: 'POST' });
  const { access_token } = await res.json();
  return access_token;
}

async function run() {
  const token = await getToken();

  // Get ALL bookings from Zoho that have Website as source (these are the ones that should have Stripe payments)
  const queries = [
    "select id, Name, Check_In, Check_Out, Room, Booking_status, Payment_status, Total_Price, Deposit_Amount, Balance_Amount, Beds24ID, Beds25ID, Stripe_Deposit_ID, Channel, Created_Time from Bookings where Channel = 'Website' and Check_In >= '2026-06-01'",
    "select id, Name, Check_In, Check_Out, Room, Booking_status, Payment_status, Total_Price, Deposit_Amount, Balance_Amount, Beds24ID, Beds25ID, Stripe_Deposit_ID, Channel, Created_Time from Bookings where Deposit_Amount > 0 and Check_In >= '2026-06-01'",
  ];

  const allBookings = new Map();

  for (const q of queries) {
    try {
      const res = await fetch('https://www.zohoapis.eu/crm/v6/coql', {
        method: 'POST',
        headers: { 'Authorization': 'Zoho-oauthtoken ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ select_query: q })
      });
      const data = await res.json();
      if (data.data) {
        for (const b of data.data) {
          allBookings.set(b.id, b);
        }
      }
    } catch (err) {
      console.log('Query error:', err.message);
    }
  }

  // Also get all bookings with Stripe IDs
  try {
    const q3 = "select id, Name, Check_In, Check_Out, Room, Booking_status, Payment_status, Total_Price, Deposit_Amount, Balance_Amount, Beds24ID, Beds25ID, Stripe_Deposit_ID, Channel, Created_Time from Bookings where Stripe_Deposit_ID is not null";
    const res = await fetch('https://www.zohoapis.eu/crm/v6/coql', {
      method: 'POST',
      headers: { 'Authorization': 'Zoho-oauthtoken ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ select_query: q3 })
    });
    const data = await res.json();
    if (data.data) {
      for (const b of data.data) {
        allBookings.set(b.id, b);
      }
    }
  } catch (err) {
    console.log('Stripe query error:', err.message);
  }

  console.log('='.repeat(110));
  console.log('ALL ZOHO BOOKINGS WITH DEPOSITS OR WEBSITE CHANNEL (since June 2026)');
  console.log('='.repeat(110));
  console.log('');

  const sorted = [...allBookings.values()].sort((a, b) => new Date(b.Created_Time) - new Date(a.Created_Time));

  for (const b of sorted) {
    const hasDeposit = b.Deposit_Amount && parseFloat(b.Deposit_Amount) > 0;
    const hasStripe = !!b.Stripe_Deposit_ID;
    const hasBeds25 = !!b.Beds25ID;
    const hasBeds24 = !!b.Beds24ID;

    let issues = [];
    if (hasDeposit && !hasStripe) issues.push('⚠️ HAS DEPOSIT BUT NO STRIPE ID');
    if (!hasBeds25) issues.push('⚠️ NO BEDS25');
    if (!hasBeds24) issues.push('⚠️ NO BEDS24');
    if (hasDeposit && b.Booking_status === 'Confirmed') issues.push('⚠️ STATUS SHOULD BE DEPOSIT_PAID');
    if (b.Payment_status === 'Deposit Paid' && b.Booking_status === 'Fully Paid') {
      // This is fine - balance was charged
    }
    if (hasStripe && !hasDeposit) issues.push('⚠️ HAS STRIPE ID BUT NO DEPOSIT AMT');

    const flag = issues.length > 0 ? '🔴' : '🟢';

    console.log(`${flag} ${b.Name} | ${b.Check_In} → ${b.Check_Out} | ${b.Room?.name || 'NONE'} | ${b.Channel}`);
    console.log(`   Status: ${b.Booking_status} | Payment: ${b.Payment_status || 'N/A'} | Total: ${b.Total_Price} PLN`);
    console.log(`   Deposit: ${b.Deposit_Amount || '-'} | Balance: ${b.Balance_Amount || '-'} | Stripe: ${b.Stripe_Deposit_ID || 'NONE'}`);
    console.log(`   Beds25: ${b.Beds25ID || 'NONE'} | Beds24: ${b.Beds24ID || 'NONE'}`);
    if (issues.length > 0) {
      console.log(`   ISSUES: ${issues.join(' | ')}`);
    }
    console.log('');
  }
}

run();
