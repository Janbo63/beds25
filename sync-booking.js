const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Fetching property to get Beds24 refresh token...");
    const property = await prisma.property.findFirst({
        where: { beds24RefreshToken: { not: null } }
    });

    if (!property) {
        console.error("No Beds24 Refresh Token found.");
        return;
    }

    console.log("Getting short-lived access token...");
    const authRes = await fetch("https://beds24.com/api/v2/authentication/token", {
        headers: { "refreshToken": property.beds24RefreshToken }
    });
    const authData = await authRes.json();
    const token = authData.token;

    console.log("Fetching booking 83496641 from Beds24 API...");
    const bookRes = await fetch("https://beds24.com/api/v2/bookings?id=83496641", {
        headers: { "token": token }
    });
    
    if (!bookRes.ok) {
        console.error("Failed to fetch booking:", await bookRes.text());
        return;
    }
    
    const bookData = await bookRes.json();
    console.log("Beds24 Response:", JSON.stringify(bookData, null, 2));

}
main().catch(console.error).finally(() => prisma.$disconnect());
