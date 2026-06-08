import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bookingService } from '@/lib/zoho-service';
import { createBeds24Booking, fetchSingleBeds24Booking } from '@/lib/beds24';
import zohoClient from '@/lib/zoho';
import { zohoToBeds25 } from '@/lib/status-map';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { bookingId, issueType, detail, zohoId, externalId } = body;

        if (!issueType) {
            return NextResponse.json({ error: 'issueType required' }, { status: 400 });
        }

        console.log(`[SyncFix] Attempting to fix ${issueType} for booking=${bookingId} zohoId=${zohoId} externalId=${externalId}`);

        // ════════════════════════════════════════════════════════════════
        // ZOHO ORPHAN: Booking exists in Zoho but NOT in Beds25
        // Pull from Zoho → create in local DB → push to Beds24
        // ════════════════════════════════════════════════════════════════
        if (issueType === 'zoho_orphan') {
            if (!zohoId) {
                return NextResponse.json({ error: 'zohoId required for zoho_orphan fix' }, { status: 400 });
            }

            // 1. Fetch full booking record from Zoho
            console.log(`[SyncFix] Fetching Zoho record ${zohoId}...`);
            const zohoRecord = await zohoClient.getRecord('Bookings', zohoId);
            if (!zohoRecord) {
                return NextResponse.json({ error: `Zoho record ${zohoId} not found` }, { status: 404 });
            }

            // 2. Find the local room by Zoho Room ID
            const zohoRoomId = zohoRecord.Room?.id;
            let localRoom: any = null;

            if (zohoRoomId) {
                // Try finding by Zoho ID (rooms synced from Zoho use Zoho ID as local ID)
                localRoom = await prisma.room.findUnique({ where: { id: zohoRoomId } });
            }

            if (!localRoom) {
                // Try by Beds24 Room ID from the Zoho record
                const beds24RoomId = zohoRecord.Beds24_Room_ID;
                if (beds24RoomId) {
                    localRoom = await prisma.room.findUnique({ where: { externalId: beds24RoomId.toString() } });
                }
            }

            if (!localRoom) {
                return NextResponse.json({ 
                    error: `Cannot find a matching local room for Zoho booking ${zohoId}. Room in Zoho: ${zohoRecord.Room?.name || 'NONE'}. Please ensure the room exists in Beds25 and has the correct Zoho/Beds24 ID mapping.` 
                }, { status: 404 });
            }

            // 3. Map Zoho record to local format
            const guestName = zohoRecord.Guest_Name || zohoRecord.Guest?.name || zohoRecord.Name?.split(' - ')[0] || 'Guest';
            const guestEmail = zohoRecord.Guest?.Email || '';
            const checkIn = zohoRecord.Check_In ? new Date(zohoRecord.Check_In) : null;
            const checkOut = zohoRecord.Check_Out ? new Date(zohoRecord.Check_Out) : null;

            if (!checkIn || !checkOut) {
                return NextResponse.json({ error: `Zoho record ${zohoId} has no valid dates` }, { status: 400 });
            }

            const bookingData = {
                roomId: localRoom.id,
                guestName,
                guestEmail,
                checkIn,
                checkOut,
                status: zohoToBeds25(zohoRecord.Booking_status) || 'CONFIRMED',
                source: zohoRecord.Channel || 'DIRECT',
                totalPrice: parseFloat(zohoRecord.Total_Price || '0'),
                numAdults: parseInt(zohoRecord.Number_of_Adults || '2'),
                numChildren: parseInt(zohoRecord.Number_of_Children || '0'),
                notes: zohoRecord.Booking_Notes || `Imported from Zoho orphan fix (${zohoId})`,
                paymentMethod: zohoRecord.Payment_Method || null,
                paymentTiming: zohoRecord.Payment_Timing || null,
                paymentStatus: zohoRecord.Payment_Status || null,
                bookingComOrderId: zohoRecord.Bookingcom_order_ID || null,
                bookingComPincode: zohoRecord.Bookingcom_Pincode || null,
                voucherCode: zohoRecord.Voucher_code || null,
                arrivalTime: zohoRecord.Arrival_time || null,
                currency: zohoRecord.Currency1 || 'PLN',
                isPrivate: zohoRecord.Private === true || zohoRecord.Private === 'true',
                externalId: zohoRecord.Beds24ID || null,
                zohoId: zohoId,
            };

            // 4. Check for existing booking to avoid duplicates
            const existingByZoho = await prisma.booking.findFirst({ where: { zohoId } });
            if (existingByZoho) {
                return NextResponse.json({ 
                    success: true, 
                    message: `Booking already exists in Beds25 with zohoId ${zohoId} — skipped to prevent duplicate.` 
                });
            }
            if (bookingData.externalId) {
                const existingByBeds24 = await prisma.booking.findFirst({ where: { externalId: bookingData.externalId } });
                if (existingByBeds24) {
                    // Link the zohoId and we're done
                    await prisma.booking.update({ where: { id: existingByBeds24.id }, data: { zohoId } });
                    return NextResponse.json({ 
                        success: true, 
                        message: `Found existing booking by Beds24 ID ${bookingData.externalId}, linked zohoId ${zohoId}.` 
                    });
                }
            }

            // 5. Create in local DB
            console.log(`[SyncFix] Creating local booking from Zoho orphan: ${guestName}, ${checkIn.toISOString()} → ${checkOut.toISOString()}`);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { roomId: _, ...dataForCreate } = bookingData;
            const localBooking = await prisma.booking.create({
                data: {
                    ...dataForCreate,
                    room: { connect: { id: localRoom.id } },
                }
            });
            console.log(`[SyncFix] Created local booking ${localBooking.id}`);

            // 6. Push to Beds24 (non-blocking — if it fails, we still have the local record)
            let beds24Id: string | null = null;
            if (!bookingData.externalId) {
                try {
                    const b24Id = await createBeds24Booking({ ...bookingData, roomId: localRoom.id });
                    if (b24Id) {
                        beds24Id = b24Id.toString();
                        await prisma.booking.update({ 
                            where: { id: localBooking.id }, 
                            data: { externalId: beds24Id } 
                        });
                        console.log(`[SyncFix] Pushed to Beds24, got ID: ${beds24Id}`);
                    }
                } catch (b24Err: any) {
                    console.warn(`[SyncFix] Beds24 push failed (non-fatal): ${b24Err?.message}`);
                }
            }

            // 7. Update Zoho with Beds25ID back-link
            try {
                await zohoClient.updateRecord('Bookings', zohoId, { 
                    Beds25ID: localBooking.id,
                    ...(beds24Id ? { Beds24ID: beds24Id } : {}),
                });
            } catch (zohoErr: any) {
                console.warn(`[SyncFix] Zoho back-link update failed (non-fatal): ${zohoErr?.message}`);
            }

            return NextResponse.json({ 
                success: true, 
                message: `Pulled "${guestName}" from Zoho into Beds25 (${localBooking.id})${beds24Id ? ` and Beds24 (${beds24Id})` : ' — Beds24 push pending'}` 
            });
        }

        // ════════════════════════════════════════════════════════════════
        // MISSING LOCALLY: Booking exists in Beds24 but NOT in Beds25
        // Pull from Beds24 → create locally → sync to Zoho
        // ════════════════════════════════════════════════════════════════
        else if (issueType === 'missing_locally') {
            if (!externalId) {
                return NextResponse.json({ error: 'externalId (Beds24 ID) required for missing_locally fix' }, { status: 400 });
            }

            // 1. Fetch from Beds24 API
            console.log(`[SyncFix] Fetching Beds24 booking ${externalId}...`);
            const b24Booking = await fetchSingleBeds24Booking(externalId);
            if (!b24Booking) {
                return NextResponse.json({ error: `Beds24 booking ${externalId} not found via API` }, { status: 404 });
            }

            // 2. Find local room by Beds24 roomId
            const localRoom = await prisma.room.findUnique({ 
                where: { externalId: b24Booking.roomId?.toString() } 
            });
            if (!localRoom) {
                return NextResponse.json({ 
                    error: `Room with Beds24 ID ${b24Booking.roomId} not found in Beds25. Run a Beds24 sync first.` 
                }, { status: 404 });
            }

            // 3. Map and create locally
            const guestName = `${b24Booking.firstName || ''} ${b24Booking.lastName || ''}`.trim() || 'Guest';
            const bookingData = {
                guestName,
                guestEmail: b24Booking.email || null,
                checkIn: new Date(b24Booking.arrival || b24Booking.firstNight),
                checkOut: new Date(b24Booking.departure || b24Booking.lastNight),
                status: b24Booking.status?.toString() === '0' ? 'CANCELLED' : 'CONFIRMED',
                source: b24Booking.apiSource || b24Booking.referer || 'BEDS24',
                totalPrice: parseFloat(b24Booking.price || '0'),
                numAdults: parseInt(b24Booking.numAdult || '2'),
                numChildren: parseInt(b24Booking.numChild || '0'),
                externalId: externalId,
                notes: `Imported via sync-fix from Beds24 (${externalId})`,
            };

            // Duplicate guard
            const existing = await prisma.booking.findFirst({ where: { externalId } });
            if (existing) {
                return NextResponse.json({ 
                    success: true, 
                    message: `Booking with Beds24 ID ${externalId} already exists in Beds25 — skipped.` 
                });
            }

            const localBooking = await prisma.booking.create({
                data: {
                    ...bookingData,
                    room: { connect: { id: localRoom.id } },
                }
            });
            console.log(`[SyncFix] Created local booking ${localBooking.id} from Beds24 ${externalId}`);

            // 4. Sync to Zoho (non-blocking)
            try {
                await bookingService.syncToZoho(localBooking, localRoom);
                console.log(`[SyncFix] Synced to Zoho successfully`);
            } catch (zohoErr: any) {
                console.warn(`[SyncFix] Zoho sync failed (non-fatal): ${zohoErr?.message}`);
            }

            return NextResponse.json({ 
                success: true, 
                message: `Pulled "${guestName}" from Beds24 into Beds25 (${localBooking.id}) and synced to Zoho` 
            });
        }

        // ════════════════════════════════════════════════════════════════
        // ZOHO MISSING ROOM: Zoho record has no Room reference
        // Try to find and link the correct room
        // ════════════════════════════════════════════════════════════════
        else if (issueType === 'zoho_missing_room') {
            if (!zohoId) {
                return NextResponse.json({ error: 'zohoId required for zoho_missing_room fix' }, { status: 400 });
            }

            // 1. Fetch the Zoho record to check current state
            const zohoRecord = await zohoClient.getRecord('Bookings', zohoId);
            if (!zohoRecord) {
                return NextResponse.json({ error: `Zoho record ${zohoId} not found` }, { status: 404 });
            }

            // Check if room has since been added manually
            if (zohoRecord.Room?.id) {
                return NextResponse.json({ 
                    success: true, 
                    message: `Room is now set on Zoho record ${zohoId} (${zohoRecord.Room.name}). No fix needed.` 
                });
            }

            // 2. Try to find the room via the Beds24 ID on this booking
            const beds24BookingId = zohoRecord.Beds24ID || externalId;
            if (!beds24BookingId) {
                return NextResponse.json({ 
                    error: `Zoho record ${zohoId} has no Beds24 ID — cannot auto-detect the room. Please set the Room manually in Zoho CRM.` 
                }, { status: 400 });
            }

            // Look up the Beds24 booking to find its roomId
            const b24Booking = await fetchSingleBeds24Booking(beds24BookingId);
            if (!b24Booking?.roomId) {
                return NextResponse.json({ 
                    error: `Could not fetch Beds24 booking ${beds24BookingId} or it has no roomId. Please set the Room manually in Zoho CRM.` 
                }, { status: 404 });
            }

            // Find local room by Beds24 externalId
            const localRoom = await prisma.room.findUnique({ 
                where: { externalId: b24Booking.roomId.toString() } 
            });
            if (!localRoom) {
                return NextResponse.json({ 
                    error: `Room with Beds24 ID ${b24Booking.roomId} not found in Beds25.` 
                }, { status: 404 });
            }

            // 3. Update Zoho record with correct room reference
            // The room's local ID IS the Zoho ID (rooms use Zoho ID as primary key)
            await zohoClient.updateRecord('Bookings', zohoId, {
                Room: { id: localRoom.id }
            });

            console.log(`[SyncFix] Set room on Zoho ${zohoId} to ${localRoom.name} (${localRoom.id})`);
            return NextResponse.json({ 
                success: true, 
                message: `Linked room "${localRoom.name}" to Zoho booking ${zohoId}` 
            });
        }

        // ════════════════════════════════════════════════════════════════
        // ZOHO DUPLICATE BOOKING: Multiple Zoho records for same Beds24 ID
        // Delete the duplicates (ones without Room), keep the original
        // ════════════════════════════════════════════════════════════════
        else if (issueType === 'zoho_duplicate_booking') {
            if (!zohoId) {
                return NextResponse.json({ error: 'zohoId (comma-separated list) required for zoho_duplicate fix' }, { status: 400 });
            }

            const zohoIds = zohoId.split(',').map((id: string) => id.trim()).filter(Boolean);
            if (zohoIds.length < 2) {
                return NextResponse.json({ error: 'Need at least 2 Zoho IDs to deduplicate' }, { status: 400 });
            }

            // Fetch all records to decide which to keep
            const records: Array<{ id: string, hasRoom: boolean, hasBeds25Link: boolean, name: string, createdTime: string }> = [];
            for (const zId of zohoIds) {
                try {
                    const rec = await zohoClient.getRecord('Bookings', zId);
                    // Check if this Zoho record is linked to a local Beds25 booking
                    let hasBeds25Link = false;
                    if (rec?.Beds25ID) {
                        const localMatch = await prisma.booking.findFirst({ where: { id: rec.Beds25ID } });
                        hasBeds25Link = !!localMatch;
                    }
                    // Also check if any local booking has this zohoId
                    if (!hasBeds25Link) {
                        const localByZoho = await prisma.booking.findFirst({ where: { zohoId: zId } });
                        hasBeds25Link = !!localByZoho;
                    }
                    records.push({
                        id: zId,
                        hasRoom: !!(rec?.Room?.id),
                        hasBeds25Link,
                        name: rec?.Name || rec?.Guest_Name || 'Unknown',
                        createdTime: rec?.Created_Time || '',
                    });
                } catch (fetchErr: any) {
                    console.warn(`[SyncFix] Could not fetch Zoho ${zId}: ${fetchErr?.message}`);
                    // Record may already be deleted — safe to remove
                    records.push({ id: zId, hasRoom: false, hasBeds25Link: false, name: 'FETCH_FAILED', createdTime: '' });
                }
            }

            // Strategy (priority order):
            // 1. Keep records linked to Beds25, delete unlinked ones
            // 2. If all/none linked: keep records WITH rooms, delete WITHOUT
            // 3. If still tied: keep the first (oldest), delete the rest
            let toKeep = records.filter(r => r.hasBeds25Link);
            let toDelete = records.filter(r => !r.hasBeds25Link);

            if (toKeep.length === 0) {
                // No Beds25 links — fall back to room-based detection
                toKeep = records.filter(r => r.hasRoom);
                toDelete = records.filter(r => !r.hasRoom);
            }

            if (toKeep.length === 0) {
                // Nothing has rooms either — keep the first, delete the rest
                toKeep.push(toDelete.shift()!);
            }

            if (toDelete.length === 0) {
                // All records are linked or all have rooms — keep the first, delete the rest
                console.log(`[SyncFix] All ${records.length} records appear valid. Keeping first (${records[0].id}), deleting rest.`);
                toKeep = [records[0]];
                toDelete = records.slice(1);
            }

            // Delete the duplicates
            const deleted: string[] = [];
            const failed: string[] = [];
            for (const dup of toDelete) {
                try {
                    await zohoClient.deleteRecord('Bookings', dup.id);
                    deleted.push(dup.id);
                    console.log(`[SyncFix] Deleted duplicate Zoho record ${dup.id} (${dup.name})`);
                } catch (delErr: any) {
                    console.warn(`[SyncFix] Failed to delete Zoho ${dup.id}: ${delErr?.message}`);
                    failed.push(dup.id);
                }
            }

            const keptIds = toKeep.map(r => r.id).join(', ');
            return NextResponse.json({ 
                success: true, 
                message: `Kept ${toKeep.length} record(s) [${keptIds}], deleted ${deleted.length} duplicate(s)${failed.length > 0 ? `, ${failed.length} failed` : ''}` 
            });
        }

        // ════════════════════════════════════════════════════════════════
        // EXISTING HANDLERS (unchanged logic)
        // ════════════════════════════════════════════════════════════════

        // For all remaining issue types, we need a local booking
        if (!bookingId) {
            return NextResponse.json({ error: 'bookingId required for this issue type' }, { status: 400 });
        }

        const booking = await prisma.booking.findUnique({ 
            where: { id: bookingId },
            include: { room: true }
        });

        if (!booking || !booking.room) {
            return NextResponse.json({ error: 'Booking or Room not found' }, { status: 404 });
        }

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
            // Beds24 status differs from Beds25. Extract the Beds24 status 
            // from the detail string and update Beds25 + Zoho to match.
            const detailStr = detail || '';
            
            // Parse the Beds24 status from detail like "Beds25: NEW, Beds24: CONFIRMED"
            // or "Cancelled in Beds24 but CONFIRMED in Beds25"
            let targetStatus = 'CONFIRMED'; // sensible default
            
            if (detailStr.includes('Cancelled in Beds24') || detailStr.includes('Beds24: CANCELLED')) {
                targetStatus = 'CANCELLED';
            } else {
                const beds24Match = detailStr.match(/Beds24:\s*(\w+)/i);
                if (beds24Match) {
                    targetStatus = beds24Match[1].toUpperCase();
                }
            }
            
            console.log(`[SyncFix] Syncing Beds25 status from ${booking.status} → ${targetStatus} (source: Beds24)`);
            
            // Update Beds25 status to match Beds24
            await prisma.booking.update({
                where: { id: bookingId },
                data: { 
                    status: targetStatus, 
                    notes: `Status synced from Beds24 channel (was: ${booking.status})` 
                }
            });

            // Update Zoho to match
            if (booking.zohoId) {
                try {
                    // Map status for Zoho dropdown
                    const zohoStatus = targetStatus === 'CANCELLED' ? 'Cancelled' 
                        : targetStatus === 'NEW' ? 'New'
                        : targetStatus === 'CONFIRMED' ? 'Confirmed'
                        : targetStatus;
                    await zohoClient.updateRecord('Bookings', booking.zohoId, {
                        Booking_status: zohoStatus
                    });
                    console.log(`[SyncFix] Updated Zoho status to ${zohoStatus} for ${bookingId}`);
                } catch (zohoErr: unknown) {
                    const msg = zohoErr instanceof Error ? zohoErr.message : 'Unknown';
                    console.warn(`[SyncFix] Zoho status update failed:`, msg);
                }
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
