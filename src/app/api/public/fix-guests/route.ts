import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Audit and fix duplicate Guest records.
 * Finds guests with similar names, merges data from duplicates into the primary,
 * and re-links bookings to the primary guest.
 *
 * Also marks beata michnik as CANCELLED (no-show, balance not charged).
 *
 * GET /api/public/fix-guests?key=beds25-guests-fix         → audit
 * GET /api/public/fix-guests?key=beds25-guests-fix&fix=true → apply
 */
export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-guests-fix') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    const results: any[] = [];

    // ═══════════════════════════════════════════════════════════
    // 1. Mark beata michnik as CANCELLED
    // ═══════════════════════════════════════════════════════════
    const michnikBooking = await prisma.booking.findFirst({
        where: { guestName: { contains: 'michnik' }, checkIn: new Date('2026-07-05') },
    });

    if (michnikBooking) {
        const michnikResult: any = {
            section: 'MICHNIK_CANCELLATION',
            guest: michnikBooking.guestName,
            bookingId: michnikBooking.id,
            currentStatus: michnikBooking.status,
        };

        if (applyFix) {
            await prisma.booking.update({
                where: { id: michnikBooking.id },
                data: {
                    status: 'CANCELLED',
                    notes: 'Guest informed us she would not visit. Balance not charged. Deposit 93 PLN retained.',
                },
            });

            // Sync cancellation to Zoho
            try {
                const { bookingService } = await import('@/lib/zoho-service');
                const fresh = await prisma.booking.findUnique({
                    where: { id: michnikBooking.id },
                    include: { room: true },
                });
                if (fresh?.room) {
                    await bookingService.syncToZoho(fresh, fresh.room);
                    michnikResult.zohoSynced = true;
                }
            } catch { /* non-fatal */ }

            michnikResult.action = 'CANCELLED';
        } else {
            michnikResult.action = 'AUDIT_ONLY';
        }

        results.push(michnikResult);
    }

    // ═══════════════════════════════════════════════════════════
    // 2. Find duplicate Guest records
    // ═══════════════════════════════════════════════════════════
    const allGuests = await prisma.guest.findMany({
        include: {
            bookings: {
                select: {
                    id: true,
                    guestName: true,
                    checkIn: true,
                    checkOut: true,
                    status: true,
                    source: true,
                    guestEmail: true,
                },
                orderBy: { checkIn: 'desc' },
            },
        },
        orderBy: { name: 'asc' },
    });

    // Group by normalised name (lowercase, trimmed, single spaces)
    const nameGroups = new Map<string, typeof allGuests>();

    for (const guest of allGuests) {
        const normalised = guest.name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^a-ząćęłńóśźż\s-]/gi, ''); // Remove special chars except Polish letters

        if (!normalised || normalised.length < 3) continue;

        if (!nameGroups.has(normalised)) nameGroups.set(normalised, []);
        nameGroups.get(normalised)!.push(guest);
    }

    // Also check by email (different names, same email)
    const emailGroups = new Map<string, typeof allGuests>();
    for (const guest of allGuests) {
        if (!guest.email) continue;
        const normEmail = guest.email.toLowerCase().trim();
        if (!emailGroups.has(normEmail)) emailGroups.set(normEmail, []);
        emailGroups.get(normEmail)!.push(guest);
    }

    // Find duplicates (groups with >1 guest)
    const duplicateGroups: any[] = [];
    const processedIds = new Set<string>();

    // By name
    for (const [normName, guests] of nameGroups) {
        if (guests.length <= 1) continue;
        if (guests.every(g => processedIds.has(g.id))) continue;

        guests.forEach(g => processedIds.add(g.id));
        duplicateGroups.push({
            matchType: 'NAME',
            matchValue: normName,
            guests,
        });
    }

    // By email
    for (const [email, guests] of emailGroups) {
        if (guests.length <= 1) continue;
        if (guests.every(g => processedIds.has(g.id))) continue;

        guests.forEach(g => processedIds.add(g.id));
        duplicateGroups.push({
            matchType: 'EMAIL',
            matchValue: email,
            guests,
        });
    }

    // Process each duplicate group
    for (const group of duplicateGroups) {
        // Pick the primary: prefer guest with most data, then most bookings
        const ranked = [...group.guests].sort((a: any, b: any) => {
            const scoreA = dataScore(a);
            const scoreB = dataScore(b);
            if (scoreB !== scoreA) return scoreB - scoreA;
            return b.bookings.length - a.bookings.length;
        });

        const primary = ranked[0];
        const duplicates = ranked.slice(1);

        const groupResult: any = {
            section: 'DUPLICATE_GUESTS',
            matchType: group.matchType,
            matchValue: group.matchValue,
            primary: {
                id: primary.id,
                name: primary.name,
                email: primary.email,
                phone: primary.phone,
                firstName: primary.firstName,
                lastName: primary.lastName,
                bookingCount: primary.bookings.length,
                dataScore: dataScore(primary),
            },
            duplicates: duplicates.map((d: any) => ({
                id: d.id,
                name: d.name,
                email: d.email,
                phone: d.phone,
                firstName: d.firstName,
                lastName: d.lastName,
                bookingCount: d.bookings.length,
                dataScore: dataScore(d),
            })),
        };

        if (applyFix) {
            // Merge data from duplicates into primary (fill gaps only)
            const mergeData: Record<string, any> = {};
            for (const dup of duplicates) {
                if (!primary.email && dup.email) mergeData.email = dup.email;
                if (!primary.phone && dup.phone) mergeData.phone = dup.phone;
                if (!primary.firstName && dup.firstName) mergeData.firstName = dup.firstName;
                if (!primary.lastName && dup.lastName) mergeData.lastName = dup.lastName;
                if (!primary.address && dup.address) mergeData.address = dup.address;
                if (!primary.city && dup.city) mergeData.city = dup.city;
                if (!primary.zipCode && dup.zipCode) mergeData.zipCode = dup.zipCode;
                if (!primary.country && dup.country) mergeData.country = dup.country;
                if (!primary.nationality && dup.nationality) mergeData.nationality = dup.nationality;
            }

            // Update primary with merged data
            if (Object.keys(mergeData).length > 0) {
                await prisma.guest.update({
                    where: { id: primary.id },
                    data: mergeData,
                });
                groupResult.mergedFields = Object.keys(mergeData);
            }

            // Re-link all bookings from duplicates to primary
            let relinked = 0;
            for (const dup of duplicates) {
                if (dup.bookings.length > 0) {
                    await prisma.booking.updateMany({
                        where: { guestId: dup.id },
                        data: { guestId: primary.id },
                    });
                    relinked += dup.bookings.length;
                }
            }
            groupResult.bookingsRelinked = relinked;

            // Delete duplicate guest records (now orphaned)
            let deleted = 0;
            for (const dup of duplicates) {
                try {
                    await prisma.guest.delete({ where: { id: dup.id } });
                    deleted++;
                } catch (err: any) {
                    // May fail if unique constraint on email conflicts
                    groupResult.deleteError = groupResult.deleteError || [];
                    groupResult.deleteError.push({ id: dup.id, error: err.message });
                }
            }
            groupResult.duplicatesDeleted = deleted;

            groupResult.action = 'MERGED';
        } else {
            groupResult.action = 'AUDIT_ONLY';
        }

        results.push(groupResult);
    }

    // Also report booking records with guestEmail but no linked Guest
    const orphanBookings = await prisma.booking.findMany({
        where: {
            guestId: null,
            guestEmail: { not: null },
            status: { not: 'CANCELLED' },
        },
        select: {
            id: true,
            guestName: true,
            guestEmail: true,
            checkIn: true,
            status: true,
            source: true,
        },
        orderBy: { checkIn: 'desc' },
    });

    return NextResponse.json({
        message: applyFix ? 'Guest dedup and fixes applied' : 'Audit only — add &fix=true to apply',
        timestamp: new Date().toISOString(),
        summary: {
            totalGuests: allGuests.length,
            duplicateGroups: duplicateGroups.length,
            orphanBookings: orphanBookings.length,
        },
        results,
        orphanBookings: orphanBookings.length > 0 ? orphanBookings : 'None',
    });
}

/** Score how "complete" a guest record is (more fields filled = higher) */
function dataScore(guest: any): number {
    let score = 0;
    if (guest.email) score += 3;
    if (guest.phone) score += 2;
    if (guest.firstName) score++;
    if (guest.lastName) score++;
    if (guest.address) score++;
    if (guest.city) score++;
    if (guest.country) score++;
    return score;
}
