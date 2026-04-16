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

/**
 * Fetch a single booking from Beds24 by its ID.
 * Used by the webhook handler to recover missing guest data
 * when Auto Action template variables are unresolved.
 */
export async function fetchSingleBeds24Booking(bookingId: string): Promise<any | null> {
    try {
        const property = await prisma.property.findFirst({
            where: { beds24RefreshToken: { not: null } }
        });
        if (!property?.beds24RefreshToken) return null;

        const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);
        const res = await fetch(`${BEDS24_API_URL}/bookings?id=${bookingId}`, {
            headers: { 'token': accessToken }
        });
        if (!res.ok) return null;

        const data = await res.json();
        const bookings = Array.isArray(data) ? data : (data.data || []);
        return bookings.length > 0 ? bookings[0] : null;
    } catch (err) {
        console.warn('[Beds24] Failed to fetch single booking:', err);
        return null;
    }
}

export async function fetchBeds24Bookings(accessToken: string) {
    // Use arrival date range: 1 year back to 2 years ahead to capture all active/recent bookings
    const arrivalFrom = format(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const arrivalTo = format(new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    // Also include currently in-house guests (departed in the past 30 days)
    const departureFrom = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

    // Helper to traverse Beds24 API pagination
    const fetchAllPages = async (url: string) => {
        let results: any[] = [];
        let currentUrl = url;
        
        while (currentUrl) {
            const res = await fetch(currentUrl, { headers: { 'token': accessToken } });
            if (!res.ok) throw new Error('Failed to fetch bookings from Beds24: ' + currentUrl);
            const data = await res.json();
            
            const items = Array.isArray(data) ? data : (data.data || []);
            results = results.concat(items);
            
            // Check for pagination link
            if (data.pages && data.pages.nextPage) {
                currentUrl = data.pages.nextPage;
            } else {
                currentUrl = '';
            }
        }
        return results;
    };

    // Fetch two sets: by arrival range AND current in-house by departure range
    const [byArrival, byDeparture] = await Promise.all([
        fetchAllPages(`${BEDS24_API_URL}/bookings?arrivalFrom=${arrivalFrom}&arrivalTo=${arrivalTo}`),
        fetchAllPages(`${BEDS24_API_URL}/bookings?departureFrom=${departureFrom}`),
    ]);

    // Merge and deduplicate by booking ID
    const allBookings = [...byArrival];
    const seenIds = new Set(allBookings.map((b: any) => b.id?.toString()));
    for (const b of byDeparture) {
        if (!seenIds.has(b.id?.toString())) {
            allBookings.push(b);
        }
    }

    console.log(`[Beds24] Fetched ${byArrival.length} by arrival + ${byDeparture.length} by departure = ${allBookings.length} total`);
    return allBookings;
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

            // Extract enriched fields from Beds24 room type
            const roomDescription = rt.texts?.[0]?.roomDescription
                || rt.texts?.[0]?.contentDescription
                || null;
            const amenitiesJson = rt.featureCodes && rt.featureCodes.length > 0
                ? JSON.stringify(rt.featureCodes)
                : null;

            const enrichedFields = {
                roomType: rt.roomType || null,
                size: rt.roomSize ? parseFloat(rt.roomSize) : null,
                sizeUnit: rt.roomSize ? 'sqm' : null,
                minNights: rt.minStay ? parseInt(rt.minStay) : 1,
                maxStay: rt.maxStay ? parseInt(rt.maxStay) : null,
                maxOccupancy: rt.maxPeople ? parseInt(rt.maxPeople) : null,
                quantity: rt.qty ? parseInt(rt.qty) : 1,
                rackRate: rt.rackRate ? parseFloat(rt.rackRate) : null,
                cleaningFee: rt.cleaningFee ? parseFloat(rt.cleaningFee) : null,
                securityDeposit: rt.securityDeposit ? parseFloat(rt.securityDeposit) : null,
                sortOrder: rt.sellPriority ? parseInt(rt.sellPriority) : 0,
                amenities: amenitiesJson,
                description: roomDescription,
            };

            for (const unit of units) {
                const baseFields = {
                    number: unit.name || rt.name,
                    name: rt.name,
                    basePrice: parseFloat(rt.minPrice || '0'),
                    capacity: parseInt(rt.maxPeople || '2'),
                    maxAdults: parseInt(rt.maxAdult || rt.maxPeople || '2'),
                    maxChildren: parseInt(rt.maxChildren || '0'),
                    propertyId: property.id,
                    externalId: unit.id?.toString(),
                };

                const room = await prisma.room.upsert({
                    where: { externalId: unit.id?.toString() },
                    update: { ...baseFields, ...enrichedFields },
                    create: { ...baseFields, ...enrichedFields },
                });
                results[results.length - 1].rooms.push(room.number);
            }
        }
    }

    // 4. Fetch and Save Bookings
    const bookings: any[] = await fetchBeds24Bookings(accessToken);

    const mapStatus = (s: any) => {
        const strStatus = s?.toString();
        switch (strStatus) {
            case '0': return 'CANCELLED';
            case '1': return 'CONFIRMED';
            case '2': return 'NEW';
            case '3': return 'REQUEST';
            case '4': return 'CONFIRMED';
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
            const guestName = `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.title || 'Guest';
            const guestEmail = b.email || null;
            let guestId = null;

            if (guestEmail) {
                const guest = await prisma.guest.upsert({
                    where: { email: guestEmail },
                    update: {
                        name: guestName,
                        firstName: b.firstName || null,
                        lastName: b.lastName || null,
                        phone: b.phone || b.mobile || null
                    },
                    create: {
                        name: guestName,
                        firstName: b.firstName || null,
                        lastName: b.lastName || null,
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

    if (!room || !room.externalId) {
        throw new Error('Room not associated with Beds24 (missing externalId)');
    }

    if (!property?.beds24RefreshToken) {
        throw new Error('No Beds24 credentials found on property (missing refresh token)');
    }

    const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);

    // Look up or create Booking.com channel markup for this room
    const channelSettings = await prisma.channelSettings.upsert({
        where: { channel_roomId: { channel: 'BOOKING.COM', roomId } },
        update: {},
        create: { channel: 'BOOKING.COM', roomId, multiplier: 1.15, discount: 0 }
    });
    const multiplier = channelSettings.multiplier;
    const discount = channelSettings.discount;
    const adjustedPrice = Math.round((price * multiplier) - discount);

    console.log(`Beds24 price push: base=${price} × ${multiplier} - ${discount} = ${adjustedPrice}`);

    // Correct Beds24 API v2 payload format: { roomId, calendar: [{ from, to, price1 }] }
    const response = await fetch(`${BEDS24_API_URL}/inventory/rooms/calendar`, {
        method: 'POST',
        headers: {
            'token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
            roomId: parseInt(room.externalId),
            calendar: [{ from: date, to: date, price1: adjustedPrice }]
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

    if (!room || !room.externalId) {
        throw new Error('Room not associated with Beds24 (missing externalId)');
    }

    if (!property?.beds24RefreshToken) {
        throw new Error('No Beds24 credentials found on property (missing refresh token)');
    }

    const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);

    // Look up or create Booking.com channel markup for this room
    const channelSettings = await prisma.channelSettings.upsert({
        where: { channel_roomId: { channel: 'BOOKING.COM', roomId } },
        update: {},
        create: { channel: 'BOOKING.COM', roomId, multiplier: 1.15, discount: 0 }
    });
    const multiplier = channelSettings.multiplier;
    const discount = channelSettings.discount;

    console.log(`Beds24 batch price push: multiplier=${multiplier}, discount=${discount}`);

    // Correct Beds24 API v2 format: one entry per room with calendar array
    // Apply Booking.com markup to each price
    const calendarEntries = updates.map(u => ({
        from: u.date,
        to: u.date,
        price1: Math.round((u.price * multiplier) - discount)
    }));

    const payload = [{
        roomId: parseInt(room.externalId!),
        calendar: calendarEntries
    }];

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

    if (!room || !property?.beds24RefreshToken || !room.externalId) {
        await prisma.webhookLog.create({
            data: {
                direction: 'OUTGOING', source: 'BEDS24', event: 'BOOKING_CREATE', status: 'SKIPPED',
                roomId: bookingData.roomId,
                error: 'Room or Property not associated with Beds24 (missing refresh token or externalId)'
            }
        }).catch(() => { });
        throw new Error('Room or Property not associated with Beds24');
    }

    const accessToken = await getBeds24AccessToken(property.beds24RefreshToken);

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
            'token': accessToken,
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
    
    // Check if the first item (since we send an array of 1) has an ID
    if (Array.isArray(result) && result.length > 0) {
        if (result[0].new && result[0].new.id) {
            beds24Id = result[0].new.id;
        } else if (result[0].id) {
            beds24Id = result[0].id;
        } else if (result[0].bookId) {
            beds24Id = result[0].bookId;
        } else if (result[0].success === false || result[0].errors) {
            const errorMsg = result[0].message || JSON.stringify(result[0].errors) || 'Unknown validation error';
            throw new Error(`Beds24 rejected the booking: ${JSON.stringify(result[0])}`);
        } else {
            throw new Error(`Beds24 returned no ID. Raw response: ${JSON.stringify(result)}`);
        }
    } else if (result && result.new && result.new.id) {
        beds24Id = result.new.id;
    } else if (result && result.id) {
        beds24Id = result.id;
    } else if (result && result.bookId) {
        beds24Id = result.bookId;
    } else if (result && (result.success === false || result.errors)) {
        const errorMsg = result.message || JSON.stringify(result.errors) || 'Unknown validation error';
        throw new Error(`Beds24 rejected the booking: ${JSON.stringify(result)}`);
    } else {
        throw new Error(`Beds24 returned no ID. Raw response: ${JSON.stringify(result)}`);
    }

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

export async function updateBeds24Booking(
    bookingId: string,
    bookingData: { checkIn: Date; checkOut: Date; guestName: string; guestEmail?: string; numAdults?: number; numChildren?: number; totalPrice?: number; status?: string },
    refreshToken?: string
) {
    let token = '';
    if (refreshToken) {
        token = await getBeds24AccessToken(refreshToken);
    } else {
        const prop = await prisma.property.findFirst({ where: { beds24RefreshToken: { not: null } } });
        if (!prop?.beds24RefreshToken) throw new Error('No Beds24 credentials found');
        token = await getBeds24AccessToken(prop.beds24RefreshToken);
    }

    const payload = [{
        id: parseInt(bookingId),
        arrival: format(new Date(bookingData.checkIn), 'yyyy-MM-dd'),
        departure: format(new Date(bookingData.checkOut), 'yyyy-MM-dd'),
        status: bookingData.status === 'CANCELLED' ? 'cancelled' : 'confirmed',
        firstName: bookingData.guestName.split(' ')[0] || 'Guest',
        lastName: bookingData.guestName.split(' ').slice(1).join(' ') || '.',
        email: bookingData.guestEmail || '',
        numAdults: bookingData.numAdults || 2,
        numChildren: bookingData.numChildren || 0,
        price: bookingData.totalPrice?.toString() || '0',
    }];

    const response = await fetch(`${BEDS24_API_URL}/bookings`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        console.warn(`[Beds24] Update booking ${bookingId} failed: ${err}`);
    }

    await prisma.webhookLog.create({
        data: {
            direction: 'OUTGOING', source: 'BEDS24',
            event: 'BOOKING_UPDATE', status: response.ok ? 'SUCCESS' : 'ERROR',
            externalId: bookingId, payload: JSON.stringify(payload),
            error: response.ok ? null : 'Update failed'
        }
    }).catch(() => { });

    return response.ok;
}

export async function cancelBeds24Booking(bookingId: string, refreshToken?: string) {
    let token = '';

    if (refreshToken) {
        token = await getBeds24AccessToken(refreshToken);
    } else {
        const prop = await prisma.property.findFirst({ where: { beds24RefreshToken: { not: null } } });
        if (!prop?.beds24RefreshToken) {
            await prisma.webhookLog.create({
                data: {
                    direction: 'OUTGOING', source: 'BEDS24', event: 'BOOKING_CANCEL', status: 'ERROR',
                    externalId: bookingId, error: 'No Beds24 credentials found'
                }
            }).catch(() => { });
            throw new Error('No Beds24 credentials found');
        }
        token = await getBeds24AccessToken(prop.beds24RefreshToken);
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
