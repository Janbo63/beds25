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
                checkOut: true
            }
        });

        // 4. Identify valid days to update (not occupied by a booking)
        const validUpdates: Date[] = [];

        for (const day of targetDays) {
            // A day is "booked" if a booking covers it.
            // Booking covers day D if checkIn <= D < checkOut
            // (Standard hotel logic: checkout day is usually free for new check-in, 
            // but for pricing, we usually price the "night of".
            // So if I book Jan 1 to Jan 2, I pay for Jan 1.
            // So we skip update if day is >= checkIn AND day < checkOut.

            const isBooked = existingBookings.some(booking => {
                const bStart = startOfDay(new Date(booking.checkIn));
                const bEnd = startOfDay(new Date(booking.checkOut));
                return day >= bStart && day < bEnd;
            });

            if (!isBooked) {
                validUpdates.push(day);
            }
        }

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
        try {
            const beds24Updates = validUpdates.map(d => ({
                date: format(d, 'yyyy-MM-dd'),
                price: priceValue
            }));
            await updateBeds24RatesBatch(roomId, beds24Updates);
        } catch (syncError) {
            console.error('Beds24 Batch Sync Warning:', syncError);
            // We verify success of local DB, so we return success with warning if needed
        }

        return NextResponse.json({
            message: 'Rates updated successfully',
            count: validUpdates.length,
            updatedDates: validUpdates.map(d => format(d, 'yyyy-MM-dd'))
        });

    } catch (error) {
        console.error('Mass Update Error:', error);
        return NextResponse.json({ error: 'Failed to update rates' }, { status: 500 });
    }
}
