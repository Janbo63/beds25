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
    BOOKING_ADMINS: 'Booking_Admins',
    VOUCHER_CODES: 'Voucher_Codes',
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
        Payment_Method: booking.paymentMethod,
        Payment_Timing: booking.paymentTiming,
        Payment_Status: booking.paymentStatus,
        Arrvial_Time: booking.arrivalTime, // Zoho API name usually matches label/generated name
        BookingCom_Order_ID: booking.bookingComOrderId,
        BookingCom_Pincode: booking.bookingComPincode,
        Commission_Amount: booking.commissionAmount,
        Commission_Percent: booking.commissionPercent,
        Voucher_Code: booking.voucherCode,
        Discount_Amount: booking.discountAmount,
        Source_Channel: booking.source,
        Currency1: booking.currency,
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
        status: zohoRecord.Status || 'CONFIRMED', // Assuming a Status field exists or defaults
        source: zohoRecord.Source_Channel || 'DIRECT',
        paymentMethod: zohoRecord.Payment_Method,
        paymentTiming: zohoRecord.Payment_Timing,
        paymentStatus: zohoRecord.Payment_Status,
        bookingComOrderId: zohoRecord.BookingCom_Order_ID,
        bookingComPincode: zohoRecord.BookingCom_Pincode,
        commissionAmount: parseFloat(zohoRecord.Commission_Amount || 0),
        commissionPercent: parseFloat(zohoRecord.Commission_Percent || 0),
        voucherCode: zohoRecord.Voucher_Code,
        discountAmount: parseFloat(zohoRecord.Discount_Amount || 0),
        arrivalTime: zohoRecord.Arrival_Time,
        currency: zohoRecord.Currency1 || 'EUR',
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
        Room_Type: room.roomType,
        Smoking_Policy: room.smokingPolicy,
        Floor: room.floor,
        View_Type: room.viewType,
        Beds24_Room_ID: room.externalId,
        BookingCom_Room_ID: room.bookingComRoomId,
        Airbnb_Room_ID: room.airbnbRoomId,
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
        roomType: zohoRecord.Room_Type,
        smokingPolicy: zohoRecord.Smoking_Policy,
        floor: zohoRecord.Floor,
        viewType: zohoRecord.View_Type,
        externalId: zohoRecord.Beds24_Room_ID,
        bookingComRoomId: zohoRecord.BookingCom_Room_ID,
        airbnbRoomId: zohoRecord.Airbnb_Room_ID,
        // Property link needs to be handled separately or via lookup
        zohoAdminId: zohoRecord.Property?.id
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
            fields: ['id', 'Guest', 'Room', 'Check_In', 'Check_Out', 'Total_Price', 'Number_of_Adults', 'Number_of_Children', 'Guest_Ages', 'Booking_Notes', 'Payment_Method', 'Payment_Timing', 'Status', 'BookingCom_Order_ID', 'Voucher_Code']
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
    },

    /**
     * Sync an existing local booking to Zoho CRM (e.g. after Beds24 import)
     */
    async syncToZoho(localBooking: any, room: any) {
        if (process.env.ZOHO_CLIENT_ID === 'dummy') {
            console.log('[ZohoService] Skipping syncToZoho (CI Mode)');
            return;
        }

        console.log(`[ZohoService] Syncing booking ${localBooking.id} to Zoho...`);

        // 1. Find or create contact in Zoho
        let contactId: string | undefined;
        if (localBooking.guestEmail) {
            try {
                contactId = await findOrCreateContact(localBooking.guestName, localBooking.guestEmail);
            } catch (err) {
                console.warn('[ZohoService] Could not find/create contact, proceeding without:', err);
            }
        }

        // 2. Map booking to Zoho format
        const zohoData = mapBookingToZoho({
            ...localBooking,
            roomNumber: room.number || room.name,
        }, contactId, room.id);

        // 3. Create record in Zoho
        try {
            const zohoRecord = await zohoClient.createRecord(ZOHO_MODULES.BOOKINGS, zohoData);
            console.log(`[ZohoService] Booking synced to Zoho with ID: ${zohoRecord.id}`);
            return zohoRecord;
        } catch (error) {
            console.error(`[ZohoService] Failed to sync booking to Zoho:`, error);
            throw error;
        }
    }
};

/**
 * Service for managing Room interactions
 */
export const roomService = {
    /**
     * Sync from Zoho to local DB
     */
    async syncFromZohoToLocal() {
        const response = await zohoClient.getRecords(ZOHO_MODULES.ROOMS, {
            per_page: 200
        });

        if (!response.data) return;

        // Get default property for connection
        const defaultProperty = await prisma.property.findFirst();
        let propertyId = defaultProperty?.id;

        if (!propertyId) {
            const newProp = await prisma.property.create({
                data: {
                    name: 'Main Property',
                    description: 'Default Property created by Zoho Sync',
                    email: process.env.ZOHO_CURRENT_USER_EMAIL || 'admin@example.com'
                }
            });
            propertyId = newProp.id;
        }

        for (const zohoRoom of response.data) {
            const roomData = mapZohoToRoom(zohoRoom);
            await prisma.room.upsert({
                where: { id: zohoRoom.id },
                create: {
                    ...roomData,
                    property: { connect: { id: propertyId } }
                },
                update: roomData
            });
        }
        return response.data.length;
    },

    /**
    * Create a room in Zoho (from local)
    */
    async createInZoho(localRoom: any) {
        if (process.env.ZOHO_CLIENT_ID === 'dummy') return;

        const zohoData = mapRoomToZoho(localRoom);
        try {
            const zohoRecord = await zohoClient.createRecord(ZOHO_MODULES.ROOMS, zohoData);
            // Update local with Zoho ID if needed
            return zohoRecord;
        } catch (error) {
            console.error('[ZohoService] Failed to create room in Zoho:', error);
            throw error;
        }
    },

    /**
     * Sync from Zoho
     * @deprecated use syncFromZohoToLocal
     */
    async syncFromZoho() {
        return this.syncFromZohoToLocal();
    }
};

/**
 * Service for Voucher Codes
 */
export const voucherService = {
    /**
     * Create a voucher in Zoho and sync to local
     */
    async create(voucherData: any) {
        if (process.env.ZOHO_CLIENT_ID === 'dummy') return;

        // 1. Create in Zoho
        const zohoData = {
            Name: voucherData.code,
            Discount_Type: voucherData.discountType, // Percentage / Fixed Amount
            Discount_Value: voucherData.discountValue,
            Currency1: voucherData.currency,
            Min_Nights: voucherData.minNights,
            Min_Booking_Value: voucherData.minBookingValue,
            Max_Uses: voucherData.maxUses,
            Valid_From: voucherData.validFrom ? format(new Date(voucherData.validFrom), 'yyyy-MM-dd') : null,
            Valid_Until: voucherData.validUntil ? format(new Date(voucherData.validUntil), 'yyyy-MM-dd') : null,
            Active: voucherData.isActive,
            Source: voucherData.source || 'ALL',
            Description: voucherData.description
        };

        try {
            const zohoRecord = await zohoClient.createRecord(ZOHO_MODULES.VOUCHER_CODES, zohoData);

            // 2. Create local shadow
            return await prisma.voucherCode.create({
                data: {
                    ...voucherData,
                    id: zohoRecord.id, // Use Zoho ID as local ID
                }
            });
        } catch (error) {
            console.error('[ZohoService] Failed to create voucher:', error);
            throw error;
        }
    },

    /**
     * Validate a voucher code against local DB (fast)
     */
    async validate(code: string, bookingContext: { totalAmount: number, nights: number, date: Date }) {
        const voucher = await prisma.voucherCode.findUnique({
            where: { code }
        });

        if (!voucher) return { valid: false, reason: 'Invalid code' };
        if (!voucher.isActive) return { valid: false, reason: 'Code inactive' };

        // Date checks
        if (voucher.validFrom && new Date(voucher.validFrom) > bookingContext.date) return { valid: false, reason: 'Code not yet valid' };
        if (voucher.validUntil && new Date(voucher.validUntil) < bookingContext.date) return { valid: false, reason: 'Code expired' };

        // Constraints
        if (voucher.minNights && bookingContext.nights < voucher.minNights) return { valid: false, reason: `Minimum ${voucher.minNights} nights required` };
        if (voucher.minBookingValue && bookingContext.totalAmount < voucher.minBookingValue) return { valid: false, reason: `Minimum value of ${voucher.minBookingValue} required` };
        if (voucher.maxUses && voucher.usedCount >= voucher.maxUses) return { valid: false, reason: 'Code usage limit reached' };

        // Calculate discount
        let discountAmount = 0;
        if (voucher.discountType === 'Percentage') {
            discountAmount = (bookingContext.totalAmount * voucher.discountValue) / 100;
        } else {
            discountAmount = voucher.discountValue;
        }

        return {
            valid: true,
            discountAmount,
            voucher
        };
    },

    /**
     * Redeem a voucher (increment count in Zoho and Local)
     */
    async redeem(voucherId: string, bookingId: string, discountApplied: number) {
        // 1. Update local
        const updatedVoucher = await prisma.voucherCode.update({
            where: { id: voucherId },
            data: { usedCount: { increment: 1 } }
        });

        await prisma.voucherRedemption.create({
            data: {
                voucherId,
                bookingId,
                discountApplied
            }
        });

        // 2. Sync usage to Zoho
        if (process.env.ZOHO_CLIENT_ID !== 'dummy') {
            try {
                await zohoClient.updateRecord(ZOHO_MODULES.VOUCHER_CODES, voucherId, {
                    Used_Count: updatedVoucher.usedCount
                });
            } catch (err) {
                console.error('[ZohoService] Failed to update voucher usage in Zoho:', err);
                // Non-blocking, can rely on local count
            }
        }

        return updatedVoucher;
    }
};

/**
 * Service for managing Property (Booking Admins) interactions
 */
export const propertyService = {
    /**
     * Map Zoho Property (Booking Admin) to Local
     */
    mapZohoToProperty(zohoRecord: ZohoRecord): any {
        return {
            id: zohoRecord.id, // Use Zoho ID as local ID
            name: zohoRecord.Property_Name || zohoRecord.Name, // Fallback
            description: zohoRecord.Description, // If exists
            address: zohoRecord.Address, // If exists
            email: zohoRecord.Email,
            phone: zohoRecord.Phone, // If exists
            latitude: parseFloat(zohoRecord.Latitude || 0),
            longitude: parseFloat(zohoRecord.Longitude || 0),
            starRating: parseFloat(zohoRecord.Star_Rating || 0),
            propertyType: zohoRecord.Property_Type,
            currency: zohoRecord.Currency,
            timezone: zohoRecord.Timezone,
            checkInTime: zohoRecord.Check_In_Time,
            checkOutTime: zohoRecord.Check_Out_Time,
            defaultCancellationPolicy: zohoRecord.Cancellation_Policy,
            facilities: zohoRecord.Facilities,
            logoUrl: zohoRecord.Property_Logo,
            externalId: zohoRecord.Beds24_Property_ID,
            bookingComId: zohoRecord.BookingCom_Property_ID,
            airbnbId: zohoRecord.Airbnb_Property_ID,
            zohoAdminId: zohoRecord.id // The Zoho ID itself
        };
    },

    /**
     * Map Local Property to Zoho
     */
    mapPropertyToZoho(property: any): ZohoRecord {
        return {
            Property_Name: property.name,
            Email: property.email,
            Latitude: property.latitude,
            Longitude: property.longitude,
            Star_Rating: property.starRating,
            Property_Type: property.propertyType,
            Currency: property.currency,
            Timezone: property.timezone,
            Check_In_Time: property.checkInTime,
            Check_Out_Time: property.checkOutTime,
            Cancellation_Policy: property.defaultCancellationPolicy,
            Facilities: property.facilities,
            Property_Logo: property.logoUrl,
            Beds24_Property_ID: property.externalId,
            BookingCom_Property_ID: property.bookingComId,
            Airbnb_Property_ID: property.airbnbId
        };
    },

    /**
     * Sync from Zoho to Local
     */
    async syncFromZohoToLocal() {
        if (process.env.ZOHO_CLIENT_ID === 'dummy') return;

        try {
            const response = await zohoClient.getRecords(ZOHO_MODULES.BOOKING_ADMINS, {
                per_page: 50
            });

            console.log(`[ZohoService] Syncing Properties. Found ${response.data.length} records.`);

            for (const zohoRecord of response.data) {
                const propertyData = this.mapZohoToProperty(zohoRecord);

                await prisma.property.upsert({
                    where: { zohoAdminId: zohoRecord.id },
                    create: {
                        ...propertyData,
                        // Since we use zohoAdminId as specific link, we can just use that.
                        // But ID in Prisma is CUID by default. We should probably keep it CUID unless we want to force Zoho ID.
                        // mapZohoToProperty sets 'id' to zohoRecord.id. 
                        // If we want to keep CUIDs, we should remove 'id' from map and let Prisma generate, 
                        // OR use Zoho ID as the ID. Using Zoho ID as ID is cleaner for sync but tight coupling.
                        // Let's stick to using Zoho ID as the ID for properties to make relation mapping easier.
                    },
                    update: propertyData
                });
            }
        } catch (error) {
            console.error('[ZohoService] Failed to sync properties from Zoho:', error);
            throw error;
        }
    }
};
