/**
 * Zoho CRM Service Layer
 * 
 * This layer provides data access methods that integrate with Zoho CRM
 * and maintain a local database cache for performance.
 * 
 * Write Strategy: Zoho First, then Local DB
 * Read Strategy: Local DB (synced from Zoho)
 */

import zohoClient, { ZohoRecord } from './zoho';
import prisma from './prisma';
import { format } from 'date-fns';

/**
 * Zoho Module Names - matching your CRM setup
 */
export const ZOHO_MODULES = {
    BOOKINGS: 'Bookings',
    ROOMS: 'Rooms',
    PROPERTIES: 'Properties',
    PRICE_RULES: 'Price_Rules',
};

/**
 * Find or create a contact in Zoho CRM
 */
async function findOrCreateContact(guestName: string, guestEmail: string): Promise<string> {
    try {
        if (process.env.ZOHO_CLIENT_ID === 'dummy') {
            console.log('Skipping Zoho Contact Search (CI Mode)');
            return `mock-contact-id-${Date.now()}`;
        }

        // Search for existing contact by email with all required fields
        const searchQuery = `select id, Email, First_Name, Last_Name from Contacts where Email = '${guestEmail}'`;
        const searchResult = await zohoClient.searchRecords(searchQuery);

        if (searchResult.data && searchResult.data.length > 0) {
            return searchResult.data[0].id!;
        }

        // Create new contact if not found
        const [firstName, ...lastNameParts] = guestName.split(' ');
        const lastName = lastNameParts.join(' ') || firstName;

        const contactData = {
            First_Name: firstName,
            Last_Name: lastName,
            Email: guestEmail,
        };

        if (process.env.ZOHO_CLIENT_ID === 'dummy') {
            console.log('Skipping Zoho Contact Search/Create (CI Mode)');
            return `mock-contact-id-${Date.now()}`;
        }

        const newContact = await zohoClient.createRecord('Contacts', contactData);
        return newContact.id!;
    } catch (error) {
        console.error('Error finding/creating contact:', error);
        throw error;
    }
}

/**
 * Map Prisma booking to Zoho CRM format
 */
function mapBookingToZoho(booking: any, contactId?: string, roomZohoId?: string): ZohoRecord {
    const record: ZohoRecord = {
        Name: `${booking.guestName} - ${booking.roomNumber || 'Room'}`,
        Check_In: format(new Date(booking.checkIn), 'yyyy-MM-dd'),
        Check_Out: format(new Date(booking.checkOut), 'yyyy-MM-dd'),
        Total_Price: booking.totalPrice,
        Number_of_Adults: booking.numAdults,
        Number_of_Children: booking.numChildren,
        Guest_Ages: booking.guestAges,
        Booking_Notes: booking.notes,
    };

    if (contactId) {
        record.Guest = contactId;
    }

    if (roomZohoId) {
        record.Room = roomZohoId;
    }

    return record;
}

/**
 * Map Zoho record to Prisma booking format
 */
function mapZohoToBooking(zohoRecord: ZohoRecord): any {
    return {
        id: zohoRecord.id,
        roomId: zohoRecord.Room?.id || '',
        roomNumber: zohoRecord.Room?.Room_Name || '',
        guestName: zohoRecord.Guest?.name || 'Unknown Guest',
        guestEmail: zohoRecord.Guest?.Email || '',
        checkIn: new Date(zohoRecord.Check_In),
        checkOut: new Date(zohoRecord.Check_Out),
        totalPrice: parseFloat(zohoRecord.Total_Price || 0),
        numAdults: parseInt(zohoRecord.Number_of_Adults || 2),
        numChildren: parseInt(zohoRecord.Number_of_Children || 0),
        guestAges: zohoRecord.Guest_Ages,
        notes: zohoRecord.Booking_Notes,
        status: 'CONFIRMED',
        source: 'DIRECT',
    };
}

/**
 * Map Room data to Zoho format
 */
export function mapRoomToZoho(room: any): ZohoRecord {
    return {
        Name: `${room.number} - ${room.name}`,
        Room_Name: room.name,
        Base_Price: room.basePrice,
        Capacity: room.capacity,
        Max_Adults: room.maxAdults,
        Max_Children: room.maxChildren,
        Min_Nights: room.minNights,
    };
}

/**
 * Map Zoho room to Prisma format
 */
function mapZohoToRoom(zohoRecord: ZohoRecord): any {
    return {
        id: zohoRecord.id,
        number: zohoRecord.Name?.split(' - ')[0] || '',
        name: zohoRecord.Room_Name,
        basePrice: parseFloat(zohoRecord.Base_Price || 0),
        capacity: parseInt(zohoRecord.Capacity || 2),
        maxAdults: parseInt(zohoRecord.Max_Adults || 2),
        maxChildren: parseInt(zohoRecord.Max_Children || 0),
        minNights: parseInt(zohoRecord.Min_Nights || 1),
    };
}

/**
 * Booking Service - Zoho CRM backed
 */
export const bookingService = {
    /**
     * Create a new booking in Zoho CRM, then sync to local DB
     */
    async create(bookingData: any) {
        // 1. Find or create contact in Zoho CRM
        console.log('[ZohoService] Finding/Creating contact for:', bookingData.guestEmail);
        const contactId = await findOrCreateContact(bookingData.guestName, bookingData.guestEmail);
        console.log('[ZohoService] Contact ID:', contactId);

        // 2. Get the room's Zoho CRM ID (we use roomId which is already the Zoho ID)
        const roomZohoId = bookingData.roomId;

        // 3. Create booking in Zoho CRM (Skip if in CI)
        let zohoRecord: any;
        if (process.env.ZOHO_CLIENT_ID === 'dummy') {
            console.log('Skipping Zoho Booking Create (CI Mode)');
            zohoRecord = { id: `mock-booking-id-${Date.now()}` };
        } else {
            const zohoData = mapBookingToZoho(bookingData, contactId, roomZohoId);
            console.log('[ZohoService] Creating Booking in Zoho with data:', JSON.stringify(zohoData, null, 2));
            try {
                zohoRecord = await zohoClient.createRecord(ZOHO_MODULES.BOOKINGS, zohoData);
                console.log('[ZohoService] Zoho Booking created:', zohoRecord.id);
            } catch (error) {
                console.error('[ZohoService] Failed to create Zoho record:', error);
                throw error;
            }
        }

        // 4. Sync to local database
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { roomNumber, ...bookingDataForDb } = bookingData;

        const localBooking = await prisma.booking.create({
            data: {
                ...bookingDataForDb,
                id: zohoRecord.id,
                status: bookingData.status || 'CONFIRMED',
            }
        });

        return localBooking;
    },

    /**
     * Update a booking in Zoho CRM, then sync to local DB
     */
    async update(id: string, updates: any) {
        // 1. Update in Zoho CRM
        const zohoData = mapBookingToZoho(updates);
        await zohoClient.updateRecord(ZOHO_MODULES.BOOKINGS, id, zohoData);

        // 2. Sync to local database
        const localBooking = await prisma.booking.update({
            where: { id },
            data: updates
        });

        return localBooking;
    },

    /**
     * Delete a booking from Zoho CRM and local DB
     */
    async delete(id: string) {
        // 1. Delete from Zoho CRM (Skip if in CI)
        if (process.env.ZOHO_CLIENT_ID !== 'dummy') {
            await zohoClient.deleteRecord(ZOHO_MODULES.BOOKINGS, id);
        }

        // 2. Delete from local database
        await prisma.booking.delete({
            where: { id }
        });
    },

    /**
     * Sync all bookings from Zoho to local DB
     */
    async syncFromZoho() {
        const response = await zohoClient.getRecords(ZOHO_MODULES.BOOKINGS, {
            per_page: 200,
            fields: ['id', 'Guest', 'Room', 'Check_In', 'Check_Out', 'Total_Price', 'Number_of_Adults', 'Number_of_Children', 'Guest_Ages', 'Booking_Notes']
        });

        for (const zohoRecord of response.data) {
            const bookingData = mapZohoToBooking(zohoRecord);

            await prisma.booking.upsert({
                where: { id: zohoRecord.id },
                create: bookingData,
                update: bookingData
            });
        }

        return response.data.length;
    }
};

/**
 * Room Service - Zoho CRM backed
 */
export const roomService = {
    /**
     * Create a new room in Zoho CRM, then sync to local DB
     */
    async create(roomData: any) {
        // 1. Create in Zoho CRM (Skip if in CI)
        let zohoRecord: any;
        if (process.env.ZOHO_CLIENT_ID === 'dummy') {
            console.log('Skipping Zoho Sync (CI Mode)');
            zohoRecord = { id: `mock-zoho-id-${Date.now()}` };
        } else {
            const zohoData = mapRoomToZoho(roomData);
            zohoRecord = await zohoClient.createRecord(ZOHO_MODULES.ROOMS, zohoData);
        }

        // 2. Sync to local database
        const { propertyId, ...restRoomData } = roomData;
        const localRoom = await prisma.room.create({
            data: {
                id: zohoRecord.id, // Use mock ID in CI
                ...restRoomData,
                property: {
                    connect: { id: propertyId }
                }
            }
        });

        return localRoom;
    },

    /**
     * Update a room in Zoho CRM, then sync to local DB
     */
    async update(id: string, updates: any) {
        // 1. Update in Zoho CRM
        const zohoData = mapRoomToZoho(updates);
        await zohoClient.updateRecord(ZOHO_MODULES.ROOMS, id, zohoData);

        // 2. Sync to local database
        const localRoom = await prisma.room.update({
            where: { id },
            data: updates
        });

        return localRoom;
    },

    /**
     * Delete a room from Zoho CRM and local DB
     */
    async delete(id: string) {
        // 1. Delete from Zoho CRM (Skip if in CI)
        if (process.env.ZOHO_CLIENT_ID !== 'dummy') {
            try {
                await zohoClient.deleteRecord(ZOHO_MODULES.ROOMS, id);
            } catch (zohoError: any) {
                console.warn(`Zoho delete warning for Room ${id}:`, zohoError.message);
                // Continue to delete locally even if Zoho fails (e.g. already deleted)
            }
        }

        // 2. Delete from local database (Cascading)
        await prisma.room.delete({
            where: { id }
        });
    },

    /**
     * Sync all rooms from Zoho to local DB
     */
    async syncFromZoho() {
        const response = await zohoClient.getRecords(ZOHO_MODULES.ROOMS, {
            per_page: 200,
            fields: ['id', 'Name', 'Room_Name', 'Base_Price', 'Capacity', 'Max_Adults', 'Max_Children', 'Min_Nights']
        });

        console.log(`[ZohoService] Syncing Rooms. Found ${response.data.length} records.`);

        for (const zohoRecord of response.data) {
            const roomData = mapZohoToRoom(zohoRecord);

            await prisma.room.upsert({
                where: { id: zohoRecord.id },
                create: roomData,
                update: roomData
            });
        }

        return response;
    }
};
