import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { differenceInCalendarDays, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, format } from 'date-fns';

export const dynamic = 'force-dynamic';

interface KPI {
    label: string;
    value: number;
    previousValue: number;
    delta: number; // percentage change
    format: 'currency' | 'number' | 'decimal' | 'percent';
}

interface BreakdownItem {
    label: string;
    bookings: number;
    nights: number;
    revenue: number;
    percentage: number; // share of total revenue
}

function calculateNights(checkIn: Date, checkOut: Date): number {
    return Math.max(differenceInCalendarDays(new Date(checkOut), new Date(checkIn)), 1);
}

function computeMetrics(bookings: any[]) {
    const activeBookings = bookings.filter(b => b.status !== 'CANCELLED');
    const totalRevenue = activeBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    const totalNights = activeBookings.reduce((sum, b) => sum + calculateNights(b.checkIn, b.checkOut), 0);
    const count = activeBookings.length;
    const avgRevenue = count > 0 ? totalRevenue / count : 0;
    const avgNights = count > 0 ? totalNights / count : 0;

    return { totalRevenue, count, totalNights, avgRevenue, avgNights };
}

function buildBreakdown(bookings: any[], groupBy: string): BreakdownItem[] {
    const activeBookings = bookings.filter(b => b.status !== 'CANCELLED');
    const totalRevenue = activeBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    const groups = new Map<string, { bookings: number; nights: number; revenue: number }>();

    for (const b of activeBookings) {
        let key: string;
        switch (groupBy) {
            case 'room':
                key = b.room?.name || b.room?.number || 'Unknown';
                break;
            case 'private':
                key = b.isPrivate ? 'Private (Friends/Family)' : 'Public (Paying)';
                break;
            case 'channel':
            default:
                key = b.source || 'DIRECT';
                break;
        }

        const existing = groups.get(key) || { bookings: 0, nights: 0, revenue: 0 };
        existing.bookings += 1;
        existing.nights += calculateNights(b.checkIn, b.checkOut);
        existing.revenue += b.totalPrice || 0;
        groups.set(key, existing);
    }

    return Array.from(groups.entries())
        .map(([label, data]) => ({
            label,
            ...data,
            percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);
}

function buildMonthlyTrend(bookings: any[], months: number = 12) {
    const activeBookings = bookings.filter(b => b.status !== 'CANCELLED');
    const now = new Date();
    const trend: { month: string; revenue: number; bookings: number; nights: number }[] = [];

    for (let i = months - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const label = format(monthDate, 'MMM yyyy');

        const monthBookings = activeBookings.filter(b => {
            const ci = new Date(b.checkIn);
            return ci >= mStart && ci <= mEnd;
        });

        trend.push({
            month: label,
            revenue: monthBookings.reduce((s, b) => s + (b.totalPrice || 0), 0),
            bookings: monthBookings.length,
            nights: monthBookings.reduce((s, b) => s + calculateNights(b.checkIn, b.checkOut), 0),
        });
    }

    return trend;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const groupBy = searchParams.get('groupBy') || 'channel';

    try {
        // Default: this month
        const now = new Date();
        const periodStart = startDate ? new Date(startDate) : startOfMonth(now);
        const periodEnd = endDate ? new Date(endDate) : endOfMonth(now);
        const periodDays = differenceInCalendarDays(periodEnd, periodStart) + 1;

        // Previous period = same length, immediately before
        const prevEnd = subDays(periodStart, 1);
        const prevStart = subDays(prevEnd, periodDays - 1);

        // Fetch all bookings for both periods with room data
        const allBookings = await prisma.booking.findMany({
            where: {
                checkIn: {
                    gte: prevStart,
                    lte: periodEnd,
                },
            },
            include: {
                room: {
                    select: { name: true, number: true, id: true }
                }
            },
            orderBy: { checkIn: 'asc' }
        });

        // Split into current and previous period
        const currentBookings = allBookings.filter(b => {
            const ci = new Date(b.checkIn);
            return ci >= periodStart && ci <= periodEnd;
        });

        const previousBookings = allBookings.filter(b => {
            const ci = new Date(b.checkIn);
            return ci >= prevStart && ci <= prevEnd;
        });

        // Compute metrics
        const current = computeMetrics(currentBookings);
        const previous = computeMetrics(previousBookings);

        // Calculate total available room-nights for occupancy
        const totalRooms = await prisma.room.count();
        const currentOccupancy = totalRooms > 0 && periodDays > 0
            ? (current.totalNights / (totalRooms * periodDays)) * 100
            : 0;
        const previousOccupancy = totalRooms > 0 && periodDays > 0
            ? (previous.totalNights / (totalRooms * periodDays)) * 100
            : 0;

        // Build KPIs with deltas
        const calcDelta = (curr: number, prev: number) =>
            prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0);

        const kpis: KPI[] = [
            {
                label: 'Total Revenue',
                value: current.totalRevenue,
                previousValue: previous.totalRevenue,
                delta: calcDelta(current.totalRevenue, previous.totalRevenue),
                format: 'currency',
            },
            {
                label: 'Booking Count',
                value: current.count,
                previousValue: previous.count,
                delta: calcDelta(current.count, previous.count),
                format: 'number',
            },
            {
                label: 'Guest Nights',
                value: current.totalNights,
                previousValue: previous.totalNights,
                delta: calcDelta(current.totalNights, previous.totalNights),
                format: 'number',
            },
            {
                label: 'Avg Revenue / Booking',
                value: current.avgRevenue,
                previousValue: previous.avgRevenue,
                delta: calcDelta(current.avgRevenue, previous.avgRevenue),
                format: 'currency',
            },
            {
                label: 'Avg Stay',
                value: current.avgNights,
                previousValue: previous.avgNights,
                delta: calcDelta(current.avgNights, previous.avgNights),
                format: 'decimal',
            },
            {
                label: 'Occupancy Rate',
                value: Math.min(currentOccupancy, 100),
                previousValue: Math.min(previousOccupancy, 100),
                delta: calcDelta(currentOccupancy, previousOccupancy),
                format: 'percent',
            },
        ];

        // Breakdowns
        const breakdown = buildBreakdown(currentBookings, groupBy);

        // Monthly trend (last 12 months, regardless of selected period)
        const allYearBookings = await prisma.booking.findMany({
            where: {
                checkIn: { gte: subMonths(now, 12) },
            },
            include: {
                room: { select: { name: true, number: true } }
            },
        });
        const monthlyTrend = buildMonthlyTrend(allYearBookings, 12);

        // Channel breakdown (always, for the sidebar chart)
        const channelBreakdown = buildBreakdown(currentBookings, 'channel');
        const roomBreakdown = buildBreakdown(currentBookings, 'room');

        return NextResponse.json({
            period: {
                start: format(periodStart, 'yyyy-MM-dd'),
                end: format(periodEnd, 'yyyy-MM-dd'),
                days: periodDays,
                previousStart: format(prevStart, 'yyyy-MM-dd'),
                previousEnd: format(prevEnd, 'yyyy-MM-dd'),
            },
            kpis,
            breakdown,
            channelBreakdown,
            roomBreakdown,
            monthlyTrend,
            totalRooms,
        });
    } catch (error: any) {
        console.error('Analytics API Error:', error);
        return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 });
    }
}
