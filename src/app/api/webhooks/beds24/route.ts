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
        recentLogs: webhookLogs.slice(-10) // show last 10 attempts
    });
}

/**
 * Parse the raw body in whatever format Beds24 sends it.
 * Tries: JSON → URL-encoded → key:value newline-separated
 */
function parseBody(rawBody: string): Record<string, any> | null {
    // 1. Try JSON
    try {
        const parsed = JSON.parse(rawBody);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch { /* not JSON */ }

    // 2. Try URL-encoded (e.g., bookId=123&roomId=456)
    try {
        const params = new URLSearchParams(rawBody);
        const obj: Record<string, string> = {};
        let hasKeys = false;
        params.forEach((value, key) => {
            obj[key] = value;
            hasKeys = true;
        });
        if (hasKeys && obj.bookId) return obj;
    } catch { /* not URL-encoded */ }

    // 3. Try key:value format (newline separated, as shown in Beds24 docs)
    // e.g., "bookId:12345\nroomId:678\n..."
    try {
        const lines = rawBody.split('\n');
        const obj: Record<string, string> = {};
        let hasKeys = false;
        for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
                const key = line.substring(0, colonIdx).trim();
                const value = line.substring(colonIdx + 1).trim();
                obj[key] = value;
                hasKeys = true;
            }
        }
        if (hasKeys && obj.bookId) return obj;
    } catch { /* not key:value */ }

    // 4. Try JSON wrapped in a key (e.g., "bookingData={...}")
    try {
        const eqIdx = rawBody.indexOf('=');
        if (eqIdx > 0) {
            const jsonPart = rawBody.substring(eqIdx + 1);
            const parsed = JSON.parse(jsonPart);
            if (typeof parsed === 'object' && parsed !== null) return parsed;
        }
    } catch { /* not wrapped JSON */ }

    return null;
}

/**
 * POST: Webhook Handler for Beds24 Auto Actions
 * Accepts ANY content type — parses JSON, form-encoded, or key:value format.
 */
export async function POST(request: NextRequest) {
    const contentType = request.headers.get('content-type');
    let rawBody = '';

    try {
        // Read raw body as text first (works regardless of content type)
        rawBody = await request.text();
        console.log(`[Webhook] Content-Type: ${contentType}`);
        console.log(`[Webhook] Raw body (${rawBody.length} chars): ${rawBody.substring(0, 500)}`);

        // Parse the body
        const payload = parseBody(rawBody);

        if (!payload) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                contentType,
                rawBody: rawBody.substring(0, 1000),
                parsedPayload: null,
                result: 'PARSE_FAILED',
                error: 'Could not parse body in any known format'
            };
            webhookLogs.push(logEntry);
            console.error('[Webhook] Could not parse body:', rawBody.substring(0, 200));
            return NextResponse.json({ error: 'Could not parse body', rawPreview: rawBody.substring(0, 200) }, { status: 400 });
        }

        console.log('[Webhook] Parsed payload:', JSON.stringify(payload, null, 2));

        const {
            bookId, roomId, status, firstNight, lastNight,
            guestFirstName, guestLastName, guestEmail, guestPhone,
            numAdult, numChild, price, referer, apiSource
        } = payload;

        if (!bookId || !roomId) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                contentType,
                rawBody: rawBody.substring(0, 1000),
                parsedPayload: payload,
                result: 'MISSING_FIELDS',
                error: `bookId=${bookId}, roomId=${roomId}`
            };
            webhookLogs.push(logEntry);
            return NextResponse.json({ error: 'Missing bookId or roomId', parsed: payload }, { status: 400 });
        }

        // Map Status
        let mappedStatus = 'CONFIRMED';
        if (status === '0' || status === 'Cancelled') mappedStatus = 'CANCELLED';
        else if (status === '1' || status === 'Confirmed') mappedStatus = 'CONFIRMED';
        else if (status === '2' || status === 'New') mappedStatus = 'NEW';
        else if (status === '3' || status === 'Request') mappedStatus = 'REQUEST';
        else if (status === '4' || status === 'Black' || status === 'Blocked') mappedStatus = 'BLOCKED';

        // Normalize Dates
        const checkIn = new Date(firstNight);
        const checkOut = addDays(new Date(lastNight), 1);

        // Find Room
        const room = await prisma.room.findUnique({
            where: { externalId: roomId.toString() }
        });

        if (!room) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                contentType,
                rawBody: rawBody.substring(0, 1000),
                parsedPayload: payload,
                result: 'ROOM_NOT_FOUND',
                error: `Room externalId=${roomId} not in DB`
            };
            webhookLogs.push(logEntry);
            return NextResponse.json({ error: `Room ${roomId} not found` }, { status: 404 });
        }

        console.log(`[Webhook] Matched room: ${room.name} (${room.id})`);

        // Check existing
        const existingBooking = await prisma.booking.findFirst({
            where: { externalId: bookId.toString() }
        });

        const bookingData = {
            roomId: room.id,
            roomNumber: room.number,
            guestName: `${guestFirstName || ''} ${guestLastName || ''}`.trim() || 'Guest',
            guestEmail: guestEmail || '',
            checkIn,
            checkOut,
            status: mappedStatus,
            source: referer || apiSource || 'BEDS24',
            totalPrice: parseFloat(price || '0'),
            numAdults: parseInt(numAdult || '2'),
            numChildren: parseInt(numChild || '0'),
            externalId: bookId.toString(),
            notes: `Imported via Webhook from ${referer || 'Beds24'}`
        };

        if (existingBooking) {
            console.log(`[Webhook] Updating existing booking ${existingBooking.id}`);
            await bookingService.update(existingBooking.id, bookingData);
        } else {
            console.log(`[Webhook] Creating new booking from Beds24`);
            await bookingService.create(bookingData);
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            contentType,
            rawBody: rawBody.substring(0, 1000),
            parsedPayload: payload,
            result: existingBooking ? 'UPDATED' : 'CREATED',
        };
        webhookLogs.push(logEntry);

        console.log('[Webhook] Successfully processed');
        return NextResponse.json({ success: true, bookId, roomId, status: mappedStatus });
    } catch (error: any) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            contentType,
            rawBody: rawBody.substring(0, 1000),
            parsedPayload: null,
            result: 'ERROR',
            error: error?.message || 'Unknown error'
        };
        webhookLogs.push(logEntry);

        console.error('[Webhook] Error:', error?.message || error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error?.message || 'Unknown error' },
            { status: 500 }
        );
    }
}
