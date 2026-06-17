import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfDay, endOfDay, eachDayOfInterval, format, isSameDay, getDay } from 'date-fns';
import { updateBeds24RatesBatch } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { roomId, startDate, endDate, price, daysOfWeek } = body;

        // Validation
        if (!roomId || !startDate || !endDate || price === undefined || !Array.isArray(daysOfWeek)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const start = startOfDay(new Date(startDate));
        const end = startOfDay(new Date(endDate)); // Ensure we compare same-time dates
        const priceValue = parseFloat(price);

        // 1. Get all dates in range
        const allDays = eachDayOfInterval({ start, end });

        // 2. Filter by days of week (0=Sun, 1=Mon, ..., 6=Sat)
        // daysOfWeek should be array of numbers [0, 6] for weekends
        const targetDays = allDays.filter(day => daysOfWeek.includes(getDay(day)));

        console.log(`[MassUpdate] Range: ${format(start, 'yyyy-MM-dd')} to ${format(end, 'yyyy-MM-dd')} = ${allDays.length} days`);
        console.log(`[MassUpdate] Selected days of week: ${JSON.stringify(daysOfWeek)}`);
        console.log(`[MassUpdate] Matching days: ${targetDays.length} (${targetDays.map(d => `${format(d, 'yyyy-MM-dd')}=${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][getDay(d)]}`).join(', ')})`);

        if (targetDays.length === 0) {
            return NextResponse.json({ message: 'No dates matched the selected criteria', count: 0 });
        }

        // 3. Fetch existing bookings in this range to avoid overwriting booked dates
        // We look for bookings for this room that overlap with ANY part of the range
        // However, precise per-day checking is needed.
        const existingBookings = await prisma.booking.findMany({
            where: {
                roomId: roomId,
                status: { not: 'CANCELLED' },
                OR: [
                    {
                        checkIn: { lte: end },
                        checkOut: { gte: start }
                    }
                ]
            },
            select: {
                checkIn: true,
                checkOut: true,
                guestName: true,
                status: true,
            }
        });

        console.log(`[MassUpdate] Found ${existingBookings.length} overlapping bookings:`, existingBookings.map(b => `${b.guestName} ${format(new Date(b.checkIn), 'MM-dd')}-${format(new Date(b.checkOut), 'MM-dd')} (${b.status})`));

        // 4. Identify valid days to update (not occupied by a booking)
        const validUpdates: Date[] = [];
        const skippedDates: string[] = [];

        for (const day of targetDays) {
            const isBooked = existingBookings.some(booking => {
                const bStart = startOfDay(new Date(booking.checkIn));
                const bEnd = startOfDay(new Date(booking.checkOut));
                return day >= bStart && day < bEnd;
            });

            if (!isBooked) {
                validUpdates.push(day);
            } else {
                skippedDates.push(format(day, 'yyyy-MM-dd'));
            }
        }

        console.log(`[MassUpdate] Valid updates: ${validUpdates.length}, Skipped (booked): ${skippedDates.length} - ${skippedDates.join(', ')}`);

        if (validUpdates.length === 0) {
            return NextResponse.json({
                message: 'All selected dates are already booked. No prices updated.',
                count: 0
            });
        }

        // 5. Bulk Upsert to Database
        // Prisma doesn't support "bulk upsert" easily in SQLite/some drivers without raw queries or loop.
        // For simplicity and safety with limited range (usually < 365 days), we use a transaction or parallel promises.
        // Since we are using SQLite in dev, parallel promises are fine.

        await prisma.$transaction(
            validUpdates.map(date =>
                prisma.priceRule.upsert({
                    where: {
                        roomId_date: {
                            roomId,
                            date
                        }
                    },
                    update: { price: priceValue },
                    create: {
                        roomId,
                        date,
                        price: priceValue
                    }
                })
            )
        );

        // 6. Sync with Beds24
        let beds24SyncStatus = 'success';
        let beds24SyncError = '';
        try {
            const beds24Updates = validUpdates.map(d => ({
                date: format(d, 'yyyy-MM-dd'),
                price: priceValue
            }));
            await updateBeds24RatesBatch(roomId, beds24Updates);
        } catch (syncError: any) {
            console.error('Beds24 Batch Sync Warning:', syncError);
            beds24SyncStatus = 'failed';
            beds24SyncError = syncError?.message || 'Unknown sync error';
        }

        // Look up Booking.com markup for info message
        const channelInfo = await prisma.channelSettings.findUnique({
            where: { channel_roomId: { channel: 'BOOKING.COM', roomId } }
        });
        const markup = channelInfo?.multiplier ?? 1;

        return NextResponse.json({
            message: beds24SyncStatus === 'success'
                ? `Updated ${validUpdates.length} dates${skippedDates.length > 0 ? ` (${skippedDates.length} skipped — already booked)` : ''}. Synced to Beds24!${markup !== 1 ? ` (Booking.com: ×${markup} = ${Math.round(priceValue * markup)} PLN)` : ''}`
                : `Rates saved locally but Beds24 sync failed: ${beds24SyncError}`,
            count: validUpdates.length,
            skipped: skippedDates.length,
            skippedDates,
            beds24Sync: beds24SyncStatus,
            beds24Error: beds24SyncError || undefined,
            updatedDates: validUpdates.map(d => format(d, 'yyyy-MM-dd'))
        });

    } catch (error) {
        console.error('Mass Update Error:', error);
        return NextResponse.json({ error: 'Failed to update rates' }, { status: 500 });
    }
}
