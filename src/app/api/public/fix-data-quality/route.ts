import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Fix data quality issues and link orphan bookings to Guest records.
 * 
 * 1. Fix wrong emails (Mikołaj has Vijith's, Anna has phone number)
 * 2. Restore missing emails from Stripe metadata
 * 3. Create/link Guest records for orphan bookings with valid emails
 *
 * GET /api/public/fix-data-quality?key=beds25-dq-fix         → audit
 * GET /api/public/fix-data-quality?key=beds25-dq-fix&fix=true → apply
 */

// Specific data corrections based on cross-referencing Stripe and Beds24 data
const EMAIL_CORRECTIONS: Array<{
    bookingId: string;
    guest: string;
    action: 'SET_EMAIL' | 'CLEAR_EMAIL' | 'MOVE_TO_PHONE';
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
}> = [
    {
        // Mikołaj has Vijith's email wrongly assigned
        bookingId: 'cmqkn1kt00001jmz8f6og3tbl',
        guest: 'Mikołaj',
        action: 'CLEAR_EMAIL',
    },
    {
        // Anna Ścigała-kocan has phone number in email field
        bookingId: 'cmryxdnhj0005jmkq4bz1n4ur',
        guest: 'Anna Ścigała-kocan',
        action: 'MOVE_TO_PHONE',
        phone: '+48795090682',
        firstName: 'Anna',
        lastName: 'Ścigała-Kocan',
    },
    {
        // Kamila — email from Stripe metadata
        bookingId: 'cms8qjp9z0000jmstope86emn',
        guest: 'Kamila Kozaczyk',
        action: 'SET_EMAIL',
        email: 'olanin@o2.pl',
        phone: '+48736489736',
        firstName: 'Kamila',
        lastName: 'Kozaczyk',
    },
    {
        // Lukasz Kumor — email from Stripe metadata
        bookingId: 'cmrhsjuhr0003jmhxapgwkrac',
        guest: 'Lukasz Kumor',
        action: 'SET_EMAIL',
        email: 'wibowit@gmail.com',
        phone: '797734157',
        firstName: 'Lukasz',
        lastName: 'Kumor',
    },
    {
        // Janusz Siwoń — email from Stripe metadata
        bookingId: 'cmrhsp6xk000djmhxt0s2hxcs',
        guest: 'Janusz Siwoń',
        action: 'SET_EMAIL',
        email: 'jas28@tlen.pl',
        phone: '790677309',
        firstName: 'Janusz',
        lastName: 'Siwoń',
    },
    {
        // Katarzyna Sikoń — email from Stripe metadata
        bookingId: 'cmqasx92n0000jmz73aum6dbe',
        guest: 'Katarzyna Sikoń',
        action: 'SET_EMAIL',
        email: 'kasiaantcz@poczta.onet.pl',
        phone: '+48502133681',
        firstName: 'Katarzyna',
        lastName: 'Sikoń',
    },
    {
        // beata michnik — email from Stripe metadata
        bookingId: 'cmr27fegk0006jmz8xep64ev5',
        guest: 'beata michnik',
        action: 'SET_EMAIL',
        email: 'boberland@op.pl',
        phone: '+48 609485091',
        firstName: 'Beata',
        lastName: 'Michnik',
    },
    {
        // Natalia Schneeweis — already has email, just add contact details
        bookingId: 'cmq5bclp20001jmwn40zv5z0x',
        guest: 'Natalia Schneeweis',
        action: 'SET_EMAIL',
        email: 'natalia.brzezny@gmail.com',
        firstName: 'Natalia',
        lastName: 'Schneeweis',
    },
    {
        // Michael Kaufmann — already has email, just add contact details
        bookingId: 'cmq6nw6ey0003jmevls76yzto',
        guest: 'Michael Kaufmann',
        action: 'SET_EMAIL',
        email: 'Mekmann03@gmail.com',
        firstName: 'Michael',
        lastName: 'Kaufmann',
    },
    {
        // Paweł Olejniczak — already has email, add contact details
        bookingId: 'cmrhsowv70007jmhxfhjm8b79',
        guest: 'Paweł Olejniczak',
        action: 'SET_EMAIL',
        email: 'oliwa84@wp.pl',
        phone: '+48502442464',
        firstName: 'Paweł',
        lastName: 'Olejniczak',
    },
];

export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const applyFix = params.get('fix') === 'true';

    if (key !== 'beds25-dq-fix') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    const results: any[] = [];

    // ═══════════════════════════════════════════════════════════
    // 1. Apply specific email corrections
    // ═══════════════════════════════════════════════════════════
    for (const correction of EMAIL_CORRECTIONS) {
        const booking = await prisma.booking.findUnique({
            where: { id: correction.bookingId },
            include: { guest: true },
        });

        if (!booking) {
            results.push({ guest: correction.guest, action: 'NOT_FOUND', id: correction.bookingId });
            continue;
        }

        const result: any = {
            section: 'EMAIL_CORRECTION',
            guest: correction.guest,
            bookingId: correction.bookingId,
            currentEmail: booking.guestEmail || 'NONE',
            correction: correction.action,
        };

        if (applyFix) {
            const bookingUpdate: Record<string, any> = {};

            if (correction.action === 'CLEAR_EMAIL') {
                bookingUpdate.guestEmail = null;
            } else if (correction.action === 'MOVE_TO_PHONE') {
                bookingUpdate.guestEmail = null;
                // Phone stays on the Guest record
            } else if (correction.action === 'SET_EMAIL' && correction.email) {
                bookingUpdate.guestEmail = correction.email;
            }

            // Update booking email snapshot
            if (Object.keys(bookingUpdate).length > 0) {
                await prisma.booking.update({
                    where: { id: correction.bookingId },
                    data: bookingUpdate,
                });
            }

            // Create or update Guest record
            if (correction.email) {
                const existingGuest = await prisma.guest.findUnique({
                    where: { email: correction.email },
                });

                if (existingGuest) {
                    // Update existing guest with any new data
                    const guestUpdate: Record<string, any> = {};
                    if (correction.phone && !existingGuest.phone) guestUpdate.phone = correction.phone;
                    if (correction.firstName && !existingGuest.firstName) guestUpdate.firstName = correction.firstName;
                    if (correction.lastName && !existingGuest.lastName) guestUpdate.lastName = correction.lastName;

                    if (Object.keys(guestUpdate).length > 0) {
                        await prisma.guest.update({
                            where: { id: existingGuest.id },
                            data: guestUpdate,
                        });
                    }

                    // Link booking to guest
                    if (!booking.guestId) {
                        await prisma.booking.update({
                            where: { id: correction.bookingId },
                            data: { guestId: existingGuest.id },
                        });
                    }

                    result.guestAction = 'LINKED_EXISTING';
                    result.guestId = existingGuest.id;
                } else {
                    // Create new guest
                    const newGuest = await prisma.guest.create({
                        data: {
                            name: booking.guestName,
                            email: correction.email,
                            phone: correction.phone || null,
                            firstName: correction.firstName || null,
                            lastName: correction.lastName || null,
                        },
                    });

                    await prisma.booking.update({
                        where: { id: correction.bookingId },
                        data: { guestId: newGuest.id },
                    });

                    result.guestAction = 'CREATED_AND_LINKED';
                    result.guestId = newGuest.id;
                }
            } else if (correction.action === 'MOVE_TO_PHONE' && correction.phone) {
                // Create guest with phone only
                if (!booking.guestId) {
                    const newGuest = await prisma.guest.create({
                        data: {
                            name: booking.guestName.trim(),
                            phone: correction.phone,
                            firstName: correction.firstName || null,
                            lastName: correction.lastName || null,
                        },
                    });

                    await prisma.booking.update({
                        where: { id: correction.bookingId },
                        data: { guestId: newGuest.id },
                    });

                    result.guestAction = 'CREATED_WITH_PHONE';
                    result.guestId = newGuest.id;
                }
            }

            result.action = 'FIXED';
        } else {
            result.newEmail = correction.email || '(clear)';
            result.newPhone = correction.phone || null;
            result.action = 'AUDIT_ONLY';
        }

        results.push(result);
    }

    // ═══════════════════════════════════════════════════════════
    // 2. Link remaining orphan bookings with valid emails to guests
    // ═══════════════════════════════════════════════════════════
    const orphanBookings = await prisma.booking.findMany({
        where: {
            guestId: null,
            guestEmail: { not: null, notIn: ['', '0'] },
            status: { not: 'CANCELLED' },
        },
        orderBy: { checkIn: 'desc' },
    });

    // Filter to only bookings not already handled above
    const handledIds = new Set(EMAIL_CORRECTIONS.map(c => c.bookingId));

    for (const booking of orphanBookings) {
        if (handledIds.has(booking.id)) continue;

        const email = booking.guestEmail?.trim();
        if (!email || email.length < 3 || !email.includes('@')) continue;

        const result: any = {
            section: 'ORPHAN_LINK',
            guest: booking.guestName,
            email,
            bookingId: booking.id,
            checkIn: booking.checkIn?.toISOString().split('T')[0],
        };

        if (applyFix) {
            // Try to find existing guest by email
            const existingGuest = await prisma.guest.findUnique({
                where: { email },
            });

            if (existingGuest) {
                await prisma.booking.update({
                    where: { id: booking.id },
                    data: { guestId: existingGuest.id },
                });
                result.action = 'LINKED_EXISTING';
                result.guestId = existingGuest.id;
            } else {
                // Parse name
                const nameParts = booking.guestName.trim().split(/\s+/);
                const firstName = nameParts[0] || null;
                const lastName = nameParts.slice(1).join(' ') || null;

                const newGuest = await prisma.guest.create({
                    data: {
                        name: booking.guestName.trim(),
                        email,
                        firstName,
                        lastName,
                    },
                });

                await prisma.booking.update({
                    where: { id: booking.id },
                    data: { guestId: newGuest.id },
                });
                result.action = 'CREATED_AND_LINKED';
                result.guestId = newGuest.id;
            }
        } else {
            result.action = 'AUDIT_ONLY';
        }

        results.push(result);
    }

    // Summary
    const corrections = results.filter(r => r.section === 'EMAIL_CORRECTION');
    const orphanLinks = results.filter(r => r.section === 'ORPHAN_LINK');

    return NextResponse.json({
        message: applyFix ? 'Data quality fixes applied' : 'Audit only — add &fix=true to apply',
        timestamp: new Date().toISOString(),
        summary: {
            emailCorrections: corrections.length,
            orphanBookingsLinked: orphanLinks.length,
        },
        results,
    });
}
