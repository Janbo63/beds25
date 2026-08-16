const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching https://admin.zagrodaalpakoterapii.com/login...');
  const res = await fetchUrl('https://admin.zagrodaalpakoterapii.com/login');
  console.log('Status:', res.status);

  // Extract script tags
  const scriptRegex = /src="(\/_next\/static\/[^"]+)"/g;
  let match;
  const scriptUrls = [];
  while ((match = scriptRegex.exec(res.body)) !== null) {
    scriptUrls.push(match[1]);
  }

  console.log('Found script URLs:', scriptUrls);

  for (const scriptPath of scriptUrls) {
    const fullUrl = 'https://admin.zagrodaalpakoterapii.com' + scriptPath;
    try {
      const scriptRes = await fetchUrl(fullUrl);
      const hasPaymentDetails = scriptRes.body.includes('Payment Details');
      const hasPaymentStatus = scriptRes.body.includes('paymentStatus');
      console.log(` -> Chunk ${scriptPath}: Payment Details=${hasPaymentDetails}, paymentStatus=${hasPaymentStatus}, length=${scriptRes.body.length}`);
    } catch (err) {
      console.error(` -> Failed to fetch ${fullUrl}:`, err.message);
    }
  }
}

main().catch(console.error);
