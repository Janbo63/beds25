import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { createBeds24Booking } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { bookingId, issueType } = body;

        if (!bookingId || !issueType) {
            return NextResponse.json({ error: 'bookingId and issueType required' }, { status: 400 });
        }

        const booking = await prisma.booking.findUnique({ 
            where: { id: bookingId },
            include: { room: true }
        });

        if (!booking || !booking.room) {
            return NextResponse.json({ error: 'Booking or Room not found' }, { status: 404 });
        }

        console.log(`[SyncFix] Attempting to fix ${issueType} for booking ${bookingId}`);

        if (issueType === 'zoho_record_not_found') {
            // The record was deleted in Zoho. Clear local zohoId and re-sync to recreate it.
            await prisma.booking.update({ where: { id: bookingId }, data: { zohoId: null } });
            const freshBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
            if (freshBooking) {
                await bookingService.syncToZoho(freshBooking, booking.room);
            }
        } 
        else if (['missing_zoho_id', 'zoho_status_mismatch', 'zoho_date_mismatch', 'zoho_fetch_error'].includes(issueType)) {
            // Force a re-sync to Zoho (upsert handles creation or update)
            await bookingService.syncToZoho(booking, booking.room);
        } 
        else if (issueType === 'beds24_status_mismatch') {
            // Channel cancellation detected: Beds24 says cancelled but Beds25 doesn't.
            // Propagate the cancellation to Beds25 and Zoho.
            const detail = body.detail || '';
            
            if (detail.includes('Cancelled in Beds24')) {
                // Update Beds25 status to CANCELLED
                await prisma.booking.update({
                    where: { id: bookingId },
                    data: { status: 'CANCELLED', notes: `Cancelled via channel (detected by health check)` }
                });

                // Update Zoho to CANCELLED
                if (booking.zohoId) {
                    try {
                        const zohoClient = (await import('@/lib/zoho')).default;
                        await zohoClient.updateRecord('Bookings', booking.zohoId, {
                            Booking_status: 'Cancelled'
                        });
                        console.log(`[SyncFix] Propagated cancellation to Zoho for ${bookingId}`);
                    } catch (zohoErr: any) {
                        console.warn(`[SyncFix] Zoho cancellation update failed:`, zohoErr?.message);
                    }
                }
            } else {
                // Generic status mismatch — re-sync Beds25 status to Zoho
                await bookingService.syncToZoho(booking, booking.room);
            }
        }
        else if (issueType === 'missing_beds24_id') {
            // ── DUPLICATE GUARD ──
            // Only create if this booking genuinely has no externalId yet
            const freshBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
            if (freshBooking?.externalId) {
                return NextResponse.json({ 
                    success: true, 
                    message: 'Booking already has a Beds24 ID — skipped to prevent duplicate.' 
                });
            }

            // Create in Beds24 and store the ID
            const beds24Id = await createBeds24Booking(booking);
            if (beds24Id) {
                await prisma.booking.update({ 
                    where: { id: bookingId }, 
                    data: { externalId: beds24Id.toString() } 
                });
            } else {
                throw new Error("Failed to create Beds24 booking, no ID returned.");
            }
        }
        else if (issueType === 'beds24_record_not_found') {
            // externalId exists but Beds24 record was deleted. Clear externalId and recreate.
            await prisma.booking.update({ where: { id: bookingId }, data: { externalId: null } });
            const beds24Id = await createBeds24Booking(booking);
            if (beds24Id) {
                await prisma.booking.update({ 
                    where: { id: bookingId }, 
                    data: { externalId: beds24Id.toString() } 
                });
            } else {
                throw new Error("Failed to recreate Beds24 booking, no ID returned.");
            }
        }
        else {
             return NextResponse.json({ error: `Unknown issue type: ${issueType}` }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: `Fixed ${issueType}` });

    } catch (error: any) {
        console.error('[SyncFix] Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fix issue' }, { status: 500 });
    }
}
