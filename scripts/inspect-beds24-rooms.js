/**
 * Diagnostic Script: Inspect Beds24 Room Data
 * 
 * Calls Beds24 API v2 and logs the full room data so we can see
 * which fields (featureCodes, texts, roomType, roomSize, etc.)
 * are actually populated for our property.
 * 
 * Usage: node scripts/inspect-beds24-rooms.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BEDS24_API_URL = 'https://beds24.com/api/v2';

async function getAccessToken(refreshToken) {
    const res = await fetch(`${BEDS24_API_URL}/authentication/token`, {
        method: 'GET',
        headers: { 'refreshToken': refreshToken }
    });
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
    const data = await res.json();
    return data.token;
}

async function main() {
    // Get property with Beds24 credentials
    const property = await prisma.property.findFirst({
        where: { beds24RefreshToken: { not: null } },
        select: {
            id: true,
            name: true,
            beds24RefreshToken: true,
            externalId: true,
        }
    });

    if (!property?.beds24RefreshToken) {
        console.error('❌ No property with Beds24 refresh token found');
        process.exit(1);
    }

    console.log(`\n🏠 Property: ${property.name} (Beds24 ID: ${property.externalId})\n`);

    // Get access token
    const accessToken = await getAccessToken(property.beds24RefreshToken);
    console.log('✅ Got Beds24 access token\n');

    // Fetch full property data with all rooms
    const res = await fetch(`${BEDS24_API_URL}/properties?includeAllRooms=true`, {
        headers: { 'token': accessToken }
    });

    if (!res.ok) {
        console.error(`❌ API call failed: ${res.status}`);
        process.exit(1);
    }

    const data = await res.json();
    const properties = Array.isArray(data) ? data : (data.data || []);

    for (const prop of properties) {
        console.log(`━━━ Property: ${prop.name} (ID: ${prop.id}) ━━━`);

        // Show property-level featureCodes
        if (prop.featureCodes) {
            console.log(`\n📋 Property featureCodes: ${JSON.stringify(prop.featureCodes)}`);
        } else {
            console.log('\n📋 Property featureCodes: NONE');
        }

        // Show property texts
        if (prop.texts?.length) {
            console.log(`📝 Property texts languages: ${prop.texts.map(t => t.language || 'default').join(', ')}`);
        }

        const roomTypes = prop.roomTypes || [];
        console.log(`\n🛏️  Room Types: ${roomTypes.length}\n`);

        for (const rt of roomTypes) {
            console.log(`  ── ${rt.name} (ID: ${rt.id}) ──`);
            console.log(`     roomType:        ${rt.roomType || 'NOT SET'}`);
            console.log(`     qty:             ${rt.qty ?? 'NOT SET'}`);
            console.log(`     maxPeople:       ${rt.maxPeople ?? 'NOT SET'}`);
            console.log(`     maxAdult:        ${rt.maxAdult ?? 'NOT SET'}`);
            console.log(`     maxChildren:     ${rt.maxChildren ?? 'NOT SET'}`);
            console.log(`     minPrice:        ${rt.minPrice ?? 'NOT SET'}`);
            console.log(`     minStay:         ${rt.minStay ?? 'NOT SET'}`);
            console.log(`     maxStay:         ${rt.maxStay ?? 'NOT SET'}`);
            console.log(`     roomSize:        ${rt.roomSize ? `${rt.roomSize} sqm` : 'NOT SET'}`);
            console.log(`     rackRate:        ${rt.rackRate ?? 'NOT SET'}`);
            console.log(`     cleaningFee:     ${rt.cleaningFee ?? 'NOT SET'}`);
            console.log(`     securityDeposit: ${rt.securityDeposit ?? 'NOT SET'}`);
            console.log(`     sellPriority:    ${rt.sellPriority ?? 'NOT SET'}`);

            // Feature codes (amenities)
            if (rt.featureCodes && rt.featureCodes.length > 0) {
                console.log(`     featureCodes:    ${JSON.stringify(rt.featureCodes)}`);
            } else {
                console.log(`     featureCodes:    NONE`);
            }

            // Texts
            if (rt.texts && rt.texts.length > 0) {
                for (const text of rt.texts) {
                    const lang = text.language || 'default';
                    console.log(`     texts[${lang}]:`);
                    if (text.displayName) console.log(`       displayName:       ${text.displayName}`);
                    if (text.accommodationType) console.log(`       accommodationType: ${text.accommodationType}`);
                    if (text.roomDescription) console.log(`       roomDescription:   ${text.roomDescription.substring(0, 100)}...`);
                    if (text.contentDescription) console.log(`       contentDescription: ${text.contentDescription.substring(0, 100)}...`);
                }
            } else {
                console.log(`     texts:           NONE`);
            }

            // Units
            if (rt.units && rt.units.length > 0) {
                console.log(`     units:           ${rt.units.map(u => `${u.name} (${u.id})`).join(', ')}`);
            }

            // Rooms (legacy format)
            if (rt.rooms && rt.rooms.length > 0) {
                console.log(`     rooms:           ${rt.rooms.map(r => `${r.name} (${r.id})`).join(', ')}`);
            }

            console.log('');
        }
    }

    // Also dump the full raw JSON for the first room type for reference
    if (properties[0]?.roomTypes?.[0]) {
        console.log('\n━━━ FULL RAW DATA (first room type) ━━━');
        console.log(JSON.stringify(properties[0].roomTypes[0], null, 2));
    }

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
