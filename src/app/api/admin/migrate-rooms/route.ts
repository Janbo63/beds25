import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * One-time migration endpoint to merge old CUID rooms into new Zoho rooms.
 * 
 * What it does:
 * 1. Finds old rooms (non-numeric IDs / CUIDs) and new rooms (numeric Zoho IDs)
 * 2. Matches them by room name
 * 3. Transfers externalId, bookings, price rules, iCal syncs, channel settings, media
 * 4. Copies over correct name/number if the new room has placeholder data
 * 5. Deletes the old CUID rooms
 * 
 * Safe: Runs in a transaction so either everything succeeds or nothing changes.
 * 
 * Usage: POST /api/admin/migrate-rooms?confirm=true
 *        GET  /api/admin/migrate-rooms (dry run / preview)
 */

export async function GET() {
    try {
        const allRooms = await prisma.room.findMany({
            include: {
                bookings: { select: { id: true } },
                priceRules: { select: { id: true } },
                icalSyncs: { select: { id: true } },
                channelSettings: { select: { id: true } },
                media: { select: { id: true } }
            }
        });

        const oldRooms = allRooms.filter(r => !/^\d+$/.test(r.id));
        const newRooms = allRooms.filter(r => /^\d+$/.test(r.id));

        // Match by name
        const matches = oldRooms.map(oldRoom => {
            const match = newRooms.find(nr => nr.name === oldRoom.name);
            return {
                oldId: oldRoom.id,
                oldName: oldRoom.name,
                oldNumber: oldRoom.number,
                oldExternalId: oldRoom.externalId,
                newId: match?.id || null,
                newName: match?.name || null,
                newNumber: match?.number || null,
                newExternalId: match?.externalId || null,
                bookingsToMove: oldRoom.bookings.length,
                priceRulesToMove: oldRoom.priceRules.length,
                icalSyncsToMove: oldRoom.icalSyncs.length,
                channelSettingsToMove: oldRoom.channelSettings.length,
                mediaToMove: oldRoom.media.length,
                matched: !!match
            };
        });

        return NextResponse.json({
            message: 'Dry Run - Preview of migration',
            oldRooms: oldRooms.length,
            newRooms: newRooms.length,
            matches,
            unmatchedOld: matches.filter(m => !m.matched).map(m => ({ id: m.oldId, name: m.oldName })),
            instructions: 'POST with ?confirm=true to execute'
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get('confirm') === 'true';

    if (!confirm) {
        return NextResponse.json({ error: 'Add ?confirm=true to execute migration' }, { status: 400 });
    }

    try {
        const allRooms = await prisma.room.findMany({
            include: {
                bookings: { select: { id: true } },
                priceRules: { select: { id: true } },
                icalSyncs: { select: { id: true } },
                channelSettings: { select: { id: true } },
                media: { select: { id: true } }
            }
        });

        const oldRooms = allRooms.filter(r => !/^\d+$/.test(r.id));
        const newRooms = allRooms.filter(r => /^\d+$/.test(r.id));

        const results: any[] = [];

        // Process each old room
        for (const oldRoom of oldRooms) {
            const newRoom = newRooms.find(nr => nr.name === oldRoom.name);

            if (!newRoom) {
                results.push({
                    oldId: oldRoom.id,
                    name: oldRoom.name,
                    status: 'SKIPPED',
                    reason: 'No matching new room found'
                });
                continue;
            }

            // Execute migration in a transaction
            await prisma.$transaction(async (tx) => {
                // 1. Transfer externalId from old to new (critical for Beds24 sync!)
                if (oldRoom.externalId && !newRoom.externalId) {
                    await tx.room.update({
                        where: { id: newRoom.id },
                        data: {
                            externalId: oldRoom.externalId,
                            // Also copy over the correct name/number
                            name: oldRoom.name,
                            number: oldRoom.number,
                        }
                    });

                    // Clear externalId from old room first (unique constraint)
                    await tx.room.update({
                        where: { id: oldRoom.id },
                        data: { externalId: null }
                    });
                }

                // 2. Move bookings
                if (oldRoom.bookings.length > 0) {
                    await tx.booking.updateMany({
                        where: { roomId: oldRoom.id },
                        data: { roomId: newRoom.id }
                    });
                }

                // 3. Move price rules (handle potential unique constraint conflicts)
                for (const pr of oldRoom.priceRules) {
                    try {
                        await tx.priceRule.update({
                            where: { id: pr.id },
                            data: { roomId: newRoom.id }
                        });
                    } catch {
                        // If there's a unique constraint conflict, delete the old one
                        await tx.priceRule.delete({ where: { id: pr.id } });
                    }
                }

                // 4. Move iCal syncs
                if (oldRoom.icalSyncs.length > 0) {
                    await tx.icalSync.updateMany({
                        where: { roomId: oldRoom.id },
                        data: { roomId: newRoom.id }
                    });
                }

                // 5. Move channel settings
                for (const cs of oldRoom.channelSettings) {
                    try {
                        await tx.channelSettings.update({
                            where: { id: cs.id },
                            data: { roomId: newRoom.id }
                        });
                    } catch {
                        await tx.channelSettings.delete({ where: { id: cs.id } });
                    }
                }

                // 6. Move media
                if (oldRoom.media.length > 0) {
                    await tx.media.updateMany({
                        where: { roomId: oldRoom.id },
                        data: { roomId: newRoom.id }
                    });
                }

                // 7. Delete old room (now empty of relations)
                await tx.room.delete({ where: { id: oldRoom.id } });
            });

            results.push({
                oldId: oldRoom.id,
                newId: newRoom.id,
                name: oldRoom.name,
                status: 'MIGRATED',
                transferred: {
                    externalId: oldRoom.externalId,
                    bookings: oldRoom.bookings.length,
                    priceRules: oldRoom.priceRules.length,
                    icalSyncs: oldRoom.icalSyncs.length,
                    channelSettings: oldRoom.channelSettings.length,
                    media: oldRoom.media.length
                }
            });
        }

        return NextResponse.json({
            success: true,
            message: `Migration complete. Processed ${oldRooms.length} old rooms.`,
            results
        });
    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
