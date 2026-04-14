const fs = require('fs');
let env = fs.readFileSync('/var/www/beds25/.env', 'utf8');
env = env.replace(/ZOHO_REFRESH_TOKEN=".+"/, 'ZOHO_REFRESH_TOKEN="1000.6a78ff23062b000ecbdd95291beb9a1e.2139ac2fa781358bc0c16251a4dc79ff"');
fs.writeFileSync('/var/www/beds25/.env', env);
console.log('Updated .env successfully');
