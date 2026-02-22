import prisma from './prisma';
import { bookingService } from './zoho-service';
import { format } from 'date-fns';

const BEDS24_API_URL = 'https://beds24.com/api/v2';

interface ImportResult {
    property: string;
    roomTypes: string[];
}

export async function getBeds24Token(inviteCode: string) {
    console.log('Attempting Beds24 setup with code:', inviteCode.substring(0, 4) + '...');
    const response = await fetch(`${BEDS24_API_URL}/authentication/setup`, {
        method: 'GET',
        headers: {
            'code': inviteCode
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Beds24 Auth Error Status: ${response.status}`, errorText);
        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.message || `Beds24 Auth Failed (${response.status})`);
        } catch {
            throw new Error(`Beds24 Auth Failed (${response.status}): ${errorText.substring(0, 100)}`);
        }
    }

    return response.json(); // { refreshToken, token }
}

/**
 * Get a short-lived access token using the stored refresh token.
 * Use this for all API calls after initial setup.
 */
export async function getBeds24AccessToken(refreshToken: string): Promise<string> {
    console.log('Getting Beds24 access token from refresh token...');
    const response = await fetch(`${BEDS24_API_URL}/authentication/token`, {
        method: 'GET',
        headers: {
            'refreshToken': refreshToken
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Beds24 Token Refresh Failed (${response.status}): ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    return data.token; // short-lived access token
}

export async function fetchBeds24Properties(accessToken: string) {
    const response = await fetch(`${BEDS24_API_URL}/properties?includeAllRooms=true`, {
        method: 'GET',
        headers: {
            'token': accessToken
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch properties from Beds24');
    }

    return response.json();
}

export async function fetchBeds24Bookings(accessToken: string) {
    // Fetch bookings from 6 months ago up to 2 years from now to capture all active bookings
    const startDate = format(new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const endDate = format(new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

    const response = await fetch(`${BEDS24_API_URL}/bookings?startDate=${startDate}&endDate=${endDate}`, {
        method: 'GET',
        headers: {
            'token': accessToken
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch bookings from Beds24');
    }

    return response.json();
}

export async function importBeds24Data(inviteCode: string, existingRefreshToken?: string) {
    let accessToken: string;
    let refreshToken: string;

    if (existingRefreshToken) {
        // Use stored refresh token — standard path after initial setup
        console.log('[Beds24Import] Using stored refresh token for auth...');
        accessToken = await getBeds24AccessToken(existingRefreshToken);
        refreshToken = existingRefreshToken;
    } else {
        // One-time invite code setup
        console.log('[Beds24Import] Using invite code for initial setup...');
        const auth = await getBeds24Token(inviteCode);
        accessToken = auth.token;
        refreshToken = auth.refreshToken;
    }

    // 2. Fetch properties
    const propertiesData = await fetchBeds24Properties(accessToken);
    const properties = Array.isArray(propertiesData) ? propertiesData : (propertiesData.data || []);

    if (!Array.isArray(properties)) {
        console.error('Invalid properties data structure:', propertiesData);
        throw new Error('Beds24 returned an unexpected data format');
    }

    // 3. Process and Save to Database (Properties & Rooms directly)
    const results: any[] = [];

    for (const prop of properties) {
        const property = await prisma.property.upsert({
            where: { externalId: prop.id?.toString() },
            update: {
                name: prop.name,
                description: prop.description,
                address: prop.address,
                beds24InviteCode: inviteCode,
                beds24RefreshToken: refreshToken
            },
            create: {
                name: prop.name,
                description: prop.description,
                address: prop.address || '',
                externalId: prop.id?.toString(),
                beds24InviteCode: inviteCode,
                beds24RefreshToken: refreshToken
            }
        });

        results.push({ property: prop.name, rooms: [] });

        for (const rt of (prop.roomTypes || [])) {
            // In the flattened model, each "Room Type" from Beds24 is treated as a Room
            // unless it has multiple units, which we will handle by mapping rt.rooms
            const units = rt.rooms && rt.rooms.length > 0 ? rt.rooms : [{ id: rt.id, name: rt.name }];

            for (const unit of units) {
                const room = await prisma.room.upsert({
                    where: { externalId: unit.id?.toString() },
                    update: {
                        number: unit.name || rt.name,
                        name: rt.name,
                        basePrice: parseFloat(rt.basePrice || '0'),
                        capacity: parseInt(rt.maxPeople || '2'),
                        maxAdults: parseInt(rt.maxAdults || rt.maxPeople || '2'),
                        maxChildren: parseInt(rt.maxChildren || '0'),
                        propertyId: property.id,
                        externalId: unit.id?.toString()
                    },
                    create: {
                        number: unit.name || rt.name,
                        name: rt.name,
                        basePrice: parseFloat(rt.basePrice || '0'),
                        capacity: parseInt(rt.maxPeople || '2'),
                        maxAdults: parseInt(rt.maxAdults || rt.maxPeople || '2'),
                        maxChildren: parseInt(rt.maxChildren || '0'),
                        propertyId: property.id,
                        externalId: unit.id?.toString()
                    }
                });
                results[results.length - 1].rooms.push(room.number);
            }
        }
    }

    // 4. Fetch and Save Bookings
    const bookingsData = await fetchBeds24Bookings(accessToken);
    const bookings = Array.isArray(bookingsData) ? bookingsData : (bookingsData.data || []);

    const mapStatus = (s: any) => {
        const strStatus = s?.toString();
        switch (strStatus) {
            case '0': return 'CANCELLED';
            case '1': return 'CONFIRMED';
            case '2': return 'NEW';
            case '3': return 'REQUEST';
            case '4': return 'BLOCKED';
            default: return 'CONFIRMED';
        }
    };

    let zohoSynced = 0;
    let zohoFailed = 0;

    for (const b of bookings) {
        // Map to a local room
        const localRoom = await prisma.room.findUnique({
            where: { externalId: b.roomId?.toString() }
        });

        if (localRoom) {
            const guestName = `${b.firstName || ''} ${b.lastName || ''}`.trim() || 'Guest';
            const guestEmail = b.email || null;
            let guestId = null;

            if (guestEmail) {
                const guest = await prisma.guest.upsert({
                    where: { email: guestEmail },
                    update: {
                        name: guestName,
                        phone: b.phone || b.mobile || null
                    },
                    create: {
                        name: guestName,
                        email: guestEmail,
                        phone: b.phone || b.mobile || null
                    }
                });
                guestId = guest.id;
            }

            const localBooking = await prisma.booking.upsert({
                where: { externalId: b.id?.toString() },
                update: {
                    guestName: guestName,
                    guestEmail: guestEmail,
                    guestId: guestId,
                    checkIn: new Date(b.arrival),
                    checkOut: new Date(b.departure),
                    status: mapStatus(b.status),
                    source: b.apiSource || 'BEDS24',
                    totalPrice: parseFloat(b.price || '0'),
                    roomId: localRoom.id
                },
                create: {
                    guestName: guestName,
                    guestEmail: guestEmail,
                    guestId: guestId,
                    checkIn: new Date(b.arrival),
                    checkOut: new Date(b.departure),
                    status: mapStatus(b.status),
                    source: b.apiSource || 'BEDS24',
                    totalPrice: parseFloat(b.price || '0'),
                    externalId: b.id?.toString(),
                    roomId: localRoom.id
                }
            });

            // Sync to Zoho CRM (non-blocking: don't fail the import if Zoho fails)
            try {
                await bookingService.syncToZoho(localBooking, localRoom);
                zohoSynced++;
            } catch (zohoErr) {
                console.error(`[Beds24Import] Failed to sync booking ${localBooking.id} to Zoho:`, zohoErr);
                zohoFailed++;
            }
        }
    }

    return { ...results, zohoSync: { synced: zohoSynced, failed: zohoFailed } };
}

export async function updateBeds24Rates(roomId: string, date: string, price: number) {
    const room = await prisma.room.findUnique({
        where: { id: roomId }
    });

    const property = await prisma.property.findFirst({
        where: { rooms: { some: { id: roomId } } }
    });

    if (!room || !property?.beds24InviteCode || !room.externalId) {
        throw new Error('Room or Property not associated with Beds24');
    }

    const auth = await getBeds24Token(property.beds24InviteCode);
    const accessToken = auth.token;

    const response = await fetch(`${BEDS24_API_URL}/inventory/rooms/calendar`, {
        method: 'POST',
        headers: {
            'token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
            roomId: parseInt(room.externalId),
            startDate: date,
            endDate: date,
            price1: price
        }])
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to push rate to Beds24: ${err}`);
    }

    return response.json();
}

export async function updateBeds24RatesBatch(roomId: string, updates: { date: string, price: number }[]) {
    const room = await prisma.room.findUnique({
        where: { id: roomId }
    });

    const property = await prisma.property.findFirst({
        where: { rooms: { some: { id: roomId } } }
    });

    if (!room || !property?.beds24InviteCode || !room.externalId) {
        throw new Error('Room or Property not associated with Beds24');
    }

    const auth = await getBeds24Token(property.beds24InviteCode);
    const accessToken = auth.token;

    // Beds24 API v2 /inventory/rooms/calendar accepts an array of updates
    const payload = updates.map(u => ({
        roomId: parseInt(room.externalId!), // Verified existence above
        startDate: u.date,
        endDate: u.date,
        price1: u.price
    }));

    // Send in chunks of 50 to avoid payload limits if necessary, though API v2 is robust
    // For now, we'll send all at once assuming reasonable range (e.g. 1 month = 30 items)
    const response = await fetch(`${BEDS24_API_URL}/inventory/rooms/calendar`, {
        method: 'POST',
        headers: {
            'token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to push batch rates to Beds24: ${err}`);
    }

    return response.json();
}

export async function createBeds24Booking(bookingData: any) {
    const room = await prisma.room.findUnique({
        where: { id: bookingData.roomId }
    });

    const property = await prisma.property.findFirst({
        where: { rooms: { some: { id: bookingData.roomId } } }
    });

    if (!room || !property?.beds24InviteCode || !room.externalId) {
        await prisma.webhookLog.create({
            data: {
                direction: 'OUTGOING', source: 'BEDS24', event: 'BOOKING_CREATE', status: 'SKIPPED',
                roomId: bookingData.roomId,
                error: 'Room or Property not associated with Beds24 (missing invite code or externalId)'
            }
        }).catch(() => { });
        throw new Error('Room or Property not associated with Beds24');
    }

    const auth = await getBeds24Token(property.beds24InviteCode);

    const payload = [{
        roomId: parseInt(room.externalId),
        arrival: format(new Date(bookingData.checkIn), 'yyyy-MM-dd'),
        departure: format(new Date(bookingData.checkOut), 'yyyy-MM-dd'),
        status: 'confirmed',
        firstName: bookingData.guestName.split(' ')[0] || 'Guest',
        lastName: bookingData.guestName.split(' ').slice(1).join(' ') || '.',
        email: bookingData.guestEmail || '',
        phone: bookingData.phone || '',
        numAdults: bookingData.numAdults || 2,
        numChildren: bookingData.numChildren || 0,
        price: bookingData.totalPrice?.toString() || '0',
        apiSource: 'BEDS25_DIRECT'
    }];

    const response = await fetch(`${BEDS24_API_URL}/bookings`, {
        method: 'POST',
        headers: {
            'token': auth.token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        await prisma.webhookLog.create({
            data: {
                direction: 'OUTGOING', source: 'BEDS24', event: 'BOOKING_CREATE', status: 'ERROR',
                roomId: room.id, payload: JSON.stringify(payload),
                error: `Beds24 API error (${response.status}): ${err.substring(0, 500)}`
            }
        }).catch(() => { });
        throw new Error(`Failed to create booking in Beds24: ${err}`);
    }

    const result = await response.json();
    let beds24Id = null;
    if (Array.isArray(result) && result.length > 0) beds24Id = result[0].id;
    else if (result.id) beds24Id = result.id;

    await prisma.webhookLog.create({
        data: {
            direction: 'OUTGOING', source: 'BEDS24', event: 'BOOKING_CREATE', status: 'SUCCESS',
            roomId: room.id, externalId: beds24Id?.toString(),
            payload: JSON.stringify(payload),
            metadata: JSON.stringify({ guestName: bookingData.guestName, beds24BookingId: beds24Id })
        }
    }).catch(() => { });

    return beds24Id;
}

export async function cancelBeds24Booking(bookingId: string, inviteCode?: string) {
    let token = '';

    if (inviteCode) {
        const auth = await getBeds24Token(inviteCode);
        token = auth.token;
    } else {
        const prop = await prisma.property.findFirst({ where: { beds24InviteCode: { not: null } } });
        if (!prop?.beds24InviteCode) {
            await prisma.webhookLog.create({
                data: {
                    direction: 'OUTGOING', source: 'BEDS24', event: 'BOOKING_CANCEL', status: 'ERROR',
                    externalId: bookingId, error: 'No Beds24 credentials found'
                }
            }).catch(() => { });
            throw new Error('No Beds24 credentials found');
        }
        const auth = await getBeds24Token(prop.beds24InviteCode);
        token = auth.token;
    }

    const payload = [{ id: parseInt(bookingId), status: 'cancelled' }];

    const response = await fetch(`${BEDS24_API_URL}/bookings`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        await prisma.webhookLog.create({
            data: {
                direction: 'OUTGOING', source: 'BEDS24', event: 'BOOKING_CANCEL', status: 'ERROR',
                externalId: bookingId, payload: JSON.stringify(payload),
                error: `Beds24 API error (${response.status}): ${errorText.substring(0, 500)}`
            }
        }).catch(() => { });
        console.warn(`Beds24 Cancel Warning: ${errorText}`);
    } else {
        await prisma.webhookLog.create({
            data: {
                direction: 'OUTGOING', source: 'BEDS24', event: 'BOOKING_CANCEL', status: 'SUCCESS',
                externalId: bookingId, payload: JSON.stringify(payload)
            }
        }).catch(() => { });
    }

    return true;
}
