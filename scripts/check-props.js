const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.property.findMany({
    select: { id: true, name: true, externalId: true, beds24InviteCode: true, beds24RefreshToken: true }
}).then(r => {
    console.log(JSON.stringify(r, null, 2));
    p.$disconnect();
}).catch(e => { console.error(e); p.$disconnect(); });
