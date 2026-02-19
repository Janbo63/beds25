import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { addDays } from 'date-fns';

export const dynamic = 'force-dynamic';

// In-memory log of recent webhook attempts (survives until next deploy)
const webhookLogs: Array<{
    timestamp: string;
    contentType: string | null;
    rawBody: string;
    parsedPayload: any;
    result: string;
    error?: string;
}> = [];

/**
 * GET: Health check + show recent webhook logs for debugging
 */
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        endpoint: 'beds24-webhook',
        timestamp: new Date().toISOString(),
        recentLogs: webhookLogs.slice(-10)
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

/**
 * Polish month names to month numbers (0-indexed)
 */
const POLISH_MONTHS: Record<string, number> = {
    'stycznia': 0, 'lutego': 1, 'marca': 2, 'kwietnia': 3, 'maja': 4, 'czerwca': 5,
    'lipca': 6, 'sierpnia': 7, 'września': 8, 'października': 9, 'listopada': 10, 'grudnia': 11,
    // Handle encoding issues (ź→Å¼, etc)
    'wrzesnia': 8, 'pazdziernika': 9,
};

/**
 * Parse a date that might be in ISO format, or in Polish locale format like:
 * "poniedziałek, 23 lutego, 2026"  or  "2026-02-23"
 */
function parseFlexibleDate(dateStr: string): Date {
    if (!dateStr) throw new Error('Empty date string');

    // 1. Try standard ISO/US parse
    const directParse = new Date(dateStr);
    if (!isNaN(directParse.getTime())) return directParse;

    // 2. Try Polish locale: "dayName, DD monthName, YYYY" or "DD monthName YYYY"
    // Remove day name prefix (everything before first comma + space)
    let cleaned = dateStr;
    const commaIdx = cleaned.indexOf(',');
    if (commaIdx > 0) {
        cleaned = cleaned.substring(commaIdx + 1).trim();
    }
    // Remove any remaining commas
    cleaned = cleaned.replace(/,/g, '').trim();

    // Try to match: DD monthName YYYY
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 3) {
        const day = parseInt(parts[0]);
        const monthStr = parts[1].toLowerCase();
        const year = parseInt(parts[2]);

        if (!isNaN(day) && !isNaN(year)) {
            // Try exact match first
            let month = POLISH_MONTHS[monthStr];
            if (month === undefined) {
                // Try fuzzy match (handle encoding issues)
                for (const [name, num] of Object.entries(POLISH_MONTHS)) {
                    if (monthStr.includes(name.substring(0, 4)) || name.includes(monthStr.substring(0, 4))) {
                        month = num;
                        break;
                    }
                }
            }
            if (month !== undefined) {
                return new Date(year, month, day);
            }
        }
    }

    // 3. Try to extract any date-like pattern: YYYY-MM-DD or DD/MM/YYYY or DD.MM.YYYY
    const isoMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));

    const euMatch = dateStr.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (euMatch) return new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]));

    throw new Error(`Cannot parse date: "${dateStr}"`);
}

/**
 * Parse price string that may include currency symbols and European comma format
 * e.g., "544,00zł" → 544.00, "1.250,00 EUR" → 1250.00
 */
function parsePrice(priceStr: string): number {
    if (!priceStr) return 0;
    // Remove all non-numeric chars except dots and commas
    let cleaned = priceStr.replace(/[^\d.,]/g, '');
    // Handle European format: 1.250,00 → replace last comma with dot
    if (cleaned.includes(',')) {
        // Remove thousand separators (dots before comma)
        const lastComma = cleaned.lastIndexOf(',');
        const beforeComma = cleaned.substring(0, lastComma).replace(/\./g, '');
        const afterComma = cleaned.substring(lastComma + 1);
        cleaned = `${beforeComma}.${afterComma}`;
    }
    return parseFloat(cleaned) || 0;
}

/**
 * Check if a string is an unresolved template variable like [guestlastname]
 */
function isUnresolved(value: string): boolean {
    return /^\[.+\]$/.test(value?.trim?.() || '');
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
            webhookLogs.push({ timestamp: new Date().toISOString(), contentType, rawBody: rawBody.substring(0, 1000), parsedPayload: null, result: 'PARSE_FAILED', error: 'Could not parse body' });
            return NextResponse.json({ error: 'Could not parse body', rawPreview: rawBody.substring(0, 200) }, { status: 400 });
        }

        console.log('[Webhook] Parsed payload:', JSON.stringify(payload, null, 2));

        const {
            bookId, roomId, status, firstNight, lastNight,
            guestFirstName, guestLastName, guestEmail,
            numAdult, numChild, price, referer, apiSource
        } = payload;

        if (!bookId || !roomId) {
            webhookLogs.push({ timestamp: new Date().toISOString(), contentType, rawBody: rawBody.substring(0, 1000), parsedPayload: payload, result: 'MISSING_FIELDS', error: `bookId=${bookId}, roomId=${roomId}` });
            return NextResponse.json({ error: 'Missing bookId or roomId', parsed: payload }, { status: 400 });
        }

        // Map Status (handle both numeric and text values)
        let mappedStatus = 'CONFIRMED';
        const statusLower = (status || '').toString().toLowerCase();
        if (statusLower === '0' || statusLower === 'cancelled') mappedStatus = 'CANCELLED';
        else if (statusLower === '1' || statusLower === 'confirmed') mappedStatus = 'CONFIRMED';
        else if (statusLower === '2' || statusLower === 'new') mappedStatus = 'NEW';
        else if (statusLower === '3' || statusLower === 'request') mappedStatus = 'REQUEST';
        else if (statusLower === '4' || statusLower === 'black' || statusLower === 'blocked') mappedStatus = 'BLOCKED';

        // Parse dates (handles Polish locale, ISO, and European formats)
        const checkIn = parseFlexibleDate(firstNight);
        const checkOut = addDays(parseFlexibleDate(lastNight), 1);
        console.log(`[Webhook] Parsed dates: checkIn=${checkIn.toISOString()}, checkOut=${checkOut.toISOString()}`);

        // Find Room
        const room = await prisma.room.findUnique({
            where: { externalId: roomId.toString() }
        });

        if (!room) {
            webhookLogs.push({ timestamp: new Date().toISOString(), contentType, rawBody: rawBody.substring(0, 1000), parsedPayload: payload, result: 'ROOM_NOT_FOUND', error: `externalId=${roomId}` });
            return NextResponse.json({ error: `Room ${roomId} not found` }, { status: 404 });
        }

        console.log(`[Webhook] Matched room: ${room.name} (${room.id})`);

        // Check existing booking
        const existingBooking = await prisma.booking.findFirst({
            where: { externalId: bookId.toString() }
        });

        // Clean guest name (handle unresolved template variables)
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

        if (existingBooking) {
            console.log(`[Webhook] Updating existing booking ${existingBooking.id}`);
            await bookingService.update(existingBooking.id, bookingData);
        } else {
            console.log(`[Webhook] Creating new booking from Beds24`);
            await bookingService.create(bookingData);
        }

        webhookLogs.push({ timestamp: new Date().toISOString(), contentType, rawBody: rawBody.substring(0, 1000), parsedPayload: payload, result: existingBooking ? 'UPDATED' : 'CREATED' });
        console.log('[Webhook] Successfully processed');
        return NextResponse.json({ success: true, bookId, roomId, status: mappedStatus });
    } catch (error: any) {
        webhookLogs.push({ timestamp: new Date().toISOString(), contentType, rawBody: rawBody.substring(0, 1000), parsedPayload: null, result: 'ERROR', error: error?.message || 'Unknown error' });
        console.error('[Webhook] Error:', error?.message || error);
        return NextResponse.json({ error: 'Internal Server Error', message: error?.message || 'Unknown error' }, { status: 500 });
    }
}
