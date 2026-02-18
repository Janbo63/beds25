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
    const response = await fetch(`${BEDS24_API_URL}/bookings`, {
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

export async function importBeds24Data(inviteCode: string) {
    // 1. Get tokens
    const auth = await getBeds24Token(inviteCode);
    const accessToken = auth.token;
    const refreshToken = auth.refreshToken;

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
        throw new Error('Room or Property not associated with Beds24');
    }

    const auth = await getBeds24Token(property.beds24InviteCode);

    const payload = [{
        roomId: parseInt(room.externalId),
        arrival: format(new Date(bookingData.checkIn), 'yyyy-MM-dd'),
        departure: format(new Date(bookingData.checkOut), 'yyyy-MM-dd'),
        status: 'confirmed', // 1=Confirmed
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
        throw new Error(`Failed to create booking in Beds24: ${err}`);
    }

    const result = await response.json();
    // API returns array of created bookings. We sent one, expect one.
    if (Array.isArray(result) && result.length > 0) {
        return result[0].id; // Return the Beds24 Booking ID
    } else if (result.id) {
        return result.id;
    }

    return null;
}

export async function cancelBeds24Booking(bookingId: string, inviteCode?: string) {
    // We need inviteCode to get token. If not provided, try to find a default one (risky if multiple props)
    // But usually we call this with context.

    let token = '';

    if (inviteCode) {
        const auth = await getBeds24Token(inviteCode);
        token = auth.token;
    } else {
        // Fallback: try to find any property with code
        const prop = await prisma.property.findFirst({ where: { beds24InviteCode: { not: null } } });
        if (!prop?.beds24InviteCode) throw new Error('No Beds24 credentials found');
        const auth = await getBeds24Token(prop.beds24InviteCode);
        token = auth.token;
    }

    // To cancel, we update status to 'cancelled' (0)
    // Beds24/bookings endpoint supports PUT/POST for updates if ID is provided? 
    // Usually POST to /bookings with "id" field updates it.

    const payload = [{
        id: parseInt(bookingId),
        status: 'cancelled'
    }];

    const response = await fetch(`${BEDS24_API_URL}/bookings`, {
        method: 'POST', // POST is used for upsert/update in Beds24 v2 often
        headers: {
            'token': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        // If 404, maybe already deleted?
        console.warn(`Beds24 Cancel Warning: ${errorText}`);
    }

    return true;
}
