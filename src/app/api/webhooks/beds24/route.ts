import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { addDays } from 'date-fns';

export const dynamic = 'force-dynamic';

/**
 * GET: Health check + show recent webhook logs from database
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const showLogs = searchParams.get('logs') === 'true';

    if (showLogs) {
        const logs = await prisma.webhookLog.findMany({
            where: { source: 'BEDS24', direction: 'INCOMING' },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        return NextResponse.json({ logs });
    }

    return NextResponse.json({
        status: 'ok',
        endpoint: 'beds24-webhook',
        timestamp: new Date().toISOString(),
        hint: 'Add ?logs=true to see recent webhook logs'
    });
}

/**
 * Parse the raw body in whatever format Beds24 sends it.
 */
function parseBody(rawBody: string): Record<string, any> | null {
    try {
        const parsed = JSON.parse(rawBody);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch { /* not JSON */ }

    try {
        const params = new URLSearchParams(rawBody);
        const obj: Record<string, string> = {};
        let hasKeys = false;
        params.forEach((value, key) => { obj[key] = value; hasKeys = true; });
        if (hasKeys && obj.bookId) return obj;
    } catch { /* not URL-encoded */ }

    try {
        const lines = rawBody.split('\n');
        const obj: Record<string, string> = {};
        let hasKeys = false;
        for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
                obj[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
                hasKeys = true;
            }
        }
        if (hasKeys && obj.bookId) return obj;
    } catch { /* not key:value */ }

    try {
        const eqIdx = rawBody.indexOf('=');
        if (eqIdx > 0) {
            const parsed = JSON.parse(rawBody.substring(eqIdx + 1));
            if (typeof parsed === 'object' && parsed !== null) return parsed;
        }
    } catch { /* not wrapped JSON */ }

    return null;
}

/** Polish month names to month numbers (0-indexed) */
const POLISH_MONTHS: Record<string, number> = {
    'stycznia': 0, 'lutego': 1, 'marca': 2, 'kwietnia': 3, 'maja': 4, 'czerwca': 5,
    'lipca': 6, 'sierpnia': 7, 'września': 8, 'października': 9, 'listopada': 10, 'grudnia': 11,
    'wrzesnia': 8, 'pazdziernika': 9,
};

/** Parse date in ISO, Polish locale, or European format */
function parseFlexibleDate(dateStr: string): Date {
    if (!dateStr) throw new Error('Empty date string');

    const directParse = new Date(dateStr);
    if (!isNaN(directParse.getTime())) return directParse;

    // Polish locale: "dayName, DD monthName, YYYY"
    let cleaned = dateStr;
    const commaIdx = cleaned.indexOf(',');
    if (commaIdx > 0) cleaned = cleaned.substring(commaIdx + 1).trim();
    cleaned = cleaned.replace(/,/g, '').trim();

    const parts = cleaned.split(/\s+/);
    if (parts.length >= 3) {
        const day = parseInt(parts[0]);
        const monthStr = parts[1].toLowerCase();
        const year = parseInt(parts[2]);
        if (!isNaN(day) && !isNaN(year)) {
            let month = POLISH_MONTHS[monthStr];
            if (month === undefined) {
                for (const [name, num] of Object.entries(POLISH_MONTHS)) {
                    if (monthStr.includes(name.substring(0, 4)) || name.includes(monthStr.substring(0, 4))) {
                        month = num;
                        break;
                    }
                }
            }
            if (month !== undefined) return new Date(year, month, day);
        }
    }

    const isoMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));

    const euMatch = dateStr.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (euMatch) return new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]));

    throw new Error(`Cannot parse date: "${dateStr}"`);
}

/** Parse price with currency symbols and European comma format */
function parsePrice(priceStr: string): number {
    if (!priceStr) return 0;
    let cleaned = priceStr.replace(/[^\d.,]/g, '');
    if (cleaned.includes(',')) {
        const lastComma = cleaned.lastIndexOf(',');
        const beforeComma = cleaned.substring(0, lastComma).replace(/\./g, '');
        cleaned = `${beforeComma}.${cleaned.substring(lastComma + 1)}`;
    }
    return parseFloat(cleaned) || 0;
}

/** Check if string is an unresolved template variable like [guestlastname] */
function isUnresolved(value: string): boolean {
    return /^\[.+\]$/.test(value?.trim?.() || '');
}

/**
 * Log a webhook event to the database (fire-and-forget, never throws)
 */
async function logWebhook(data: {
    direction: string;
    source: string;
    event: string;
    status: string;
    bookingId?: string | null;
    externalId?: string | null;
    roomId?: string | null;
    payload?: string | null;
    error?: string | null;
    metadata?: string | null;
}) {
    try {
        await prisma.webhookLog.create({ data });
    } catch (err: any) {
        console.error('[WebhookLog] Failed to write log:', err?.message);
    }
}

/**
 * POST: Webhook Handler for Beds24 Auto Actions
 */
export async function POST(request: NextRequest) {
    const contentType = request.headers.get('content-type');
    let rawBody = '';

    try {
        rawBody = await request.text();
        console.log(`[Webhook] Content-Type: ${contentType}`);
        console.log(`[Webhook] Raw body (${rawBody.length} chars): ${rawBody.substring(0, 500)}`);

        const payload = parseBody(rawBody);

        if (!payload) {
            await logWebhook({
                direction: 'INCOMING', source: 'BEDS24', event: 'PARSE_FAILED', status: 'ERROR',
                payload: rawBody.substring(0, 2000),
                error: 'Could not parse body in any known format'
            });
            return NextResponse.json({ error: 'Could not parse body' }, { status: 400 });
        }

        const {
            bookId, roomId, status, firstNight, lastNight,
            guestFirstName, guestLastName, guestEmail,
            numAdult, numChild, price, referer, apiSource
        } = payload;

        if (!bookId || !roomId) {
            await logWebhook({
                direction: 'INCOMING', source: 'BEDS24', event: 'MISSING_FIELDS', status: 'ERROR',
                payload: rawBody.substring(0, 2000),
                error: `Missing required fields: bookId=${bookId}, roomId=${roomId}`
            });
            return NextResponse.json({ error: 'Missing bookId or roomId' }, { status: 400 });
        }

        // Map Status
        let mappedStatus = 'CONFIRMED';
        const statusLower = (status || '').toString().toLowerCase();
        if (statusLower === '0' || statusLower === 'cancelled') mappedStatus = 'CANCELLED';
        else if (statusLower === '1' || statusLower === 'confirmed') mappedStatus = 'CONFIRMED';
        else if (statusLower === '2' || statusLower === 'new') mappedStatus = 'NEW';
        else if (statusLower === '3' || statusLower === 'request') mappedStatus = 'REQUEST';
        else if (statusLower === '4' || statusLower === 'black' || statusLower === 'blocked') mappedStatus = 'BLOCKED';

        // Parse dates
        const checkIn = parseFlexibleDate(firstNight);
        const checkOut = addDays(parseFlexibleDate(lastNight), 1);

        // Find Room
        const room = await prisma.room.findUnique({
            where: { externalId: roomId.toString() }
        });

        if (!room) {
            await logWebhook({
                direction: 'INCOMING', source: 'BEDS24', event: 'ROOM_NOT_FOUND', status: 'ERROR',
                externalId: bookId.toString(), roomId: roomId.toString(),
                payload: rawBody.substring(0, 2000),
                error: `Room with externalId=${roomId} not found in database`
            });
            return NextResponse.json({ error: `Room ${roomId} not found` }, { status: 404 });
        }

        // Check existing booking
        const existingBooking = await prisma.booking.findFirst({
            where: { externalId: bookId.toString() }
        });

        // Clean guest data (handle unresolved template variables)
        const firstName = isUnresolved(guestFirstName) ? '' : (guestFirstName || '');
        const lastName = isUnresolved(guestLastName) ? '' : (guestLastName || '');
        const guestName = `${firstName} ${lastName}`.trim() || 'Guest';
        const cleanEmail = isUnresolved(guestEmail) ? '' : (guestEmail || '');
        const cleanReferer = isUnresolved(referer) ? 'BEDS24' : (referer || '');
        const cleanApiSource = isUnresolved(apiSource) ? '' : (apiSource || '');

        const bookingData = {
            roomId: room.id,
            roomNumber: room.number,
            guestName,
            guestEmail: cleanEmail,
            checkIn,
            checkOut,
            status: mappedStatus,
            source: cleanReferer || cleanApiSource || 'BEDS24',
            totalPrice: parsePrice(price),
            numAdults: parseInt(numAdult || '1') || 1,
            numChildren: parseInt(numChild || '0') || 0,
            externalId: bookId.toString(),
            notes: `Imported via Webhook from ${cleanReferer || 'Beds24'}`
        };

        const event = existingBooking ? 'BOOKING_UPDATE' : 'BOOKING_CREATE';

        if (existingBooking) {
            await bookingService.update(existingBooking.id, bookingData);
        } else {
            await bookingService.create(bookingData);
        }

        await logWebhook({
            direction: 'INCOMING', source: 'BEDS24', event, status: 'SUCCESS',
            externalId: bookId.toString(), roomId: room.id,
            payload: rawBody.substring(0, 2000),
            metadata: JSON.stringify({ guestName, checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString(), mappedStatus, price: parsePrice(price) })
        });

        console.log(`[Webhook] Successfully ${event === 'BOOKING_CREATE' ? 'created' : 'updated'} booking`);
        return NextResponse.json({ success: true, bookId, roomId, status: mappedStatus, action: event });
    } catch (error: any) {
        await logWebhook({
            direction: 'INCOMING', source: 'BEDS24', event: 'PROCESSING_ERROR', status: 'ERROR',
            payload: rawBody.substring(0, 2000),
            error: error?.message || 'Unknown error'
        });
        console.error('[Webhook] Error:', error?.message || error);
        return NextResponse.json({ error: 'Internal Server Error', message: error?.message }, { status: 500 });
    }
}
