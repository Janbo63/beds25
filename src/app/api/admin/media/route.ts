import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

/**
 * Upload media file (photo or video) linked to a room or property.
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const propertyId = formData.get('propertyId') as string;
        const roomId = formData.get('roomId') as string;
        const caption = formData.get('caption') as string;
        const isHero = formData.get('isHero') === 'true';

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Determine media type from file MIME type
        const type = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE';

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const uploadDir = join(process.cwd(), 'public', 'uploads');
        await mkdir(uploadDir, { recursive: true });

        const filename = `${crypto.randomUUID()}-${file.name}`;
        const path = join(uploadDir, filename);
        await writeFile(path, buffer);

        // Get the next sort order for this room/property
        const maxOrder = await prisma.media.aggregate({
            _max: { sortOrder: true },
            where: {
                OR: [
                    roomId ? { roomId } : {},
                    propertyId ? { propertyId } : {},
                ].filter(w => Object.keys(w).length > 0),
            },
        });
        const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

        // If marking as hero, unset any existing hero for this room/property
        if (isHero) {
            await prisma.media.updateMany({
                where: {
                    isHero: true,
                    ...(roomId ? { roomId } : {}),
                    ...(propertyId ? { propertyId } : {}),
                },
                data: { isHero: false },
            });
        }

        const media = await prisma.media.create({
            data: {
                url: `/uploads/${filename}`,
                alt: file.name,
                type,
                sortOrder,
                caption: caption || null,
                isHero,
                propertyId: propertyId || null,
                roomId: roomId || null,
            }
        });

        return NextResponse.json(media);
    } catch (error) {
        console.error('Media Upload Error:', error);
        return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 });
    }
}

/**
 * List media for a room or property, sorted by sortOrder.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');
    const propertyId = searchParams.get('propertyId');

    const where: any = {};
    if (roomId) where.roomId = roomId;
    else if (propertyId) where.propertyId = propertyId;

    const media = await prisma.media.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(media);
}

/**
 * Update media metadata (caption, sortOrder, isHero, alt).
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, caption, sortOrder, isHero, alt } = body;

        if (!id) {
            return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });
        }

        const existing = await prisma.media.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Media not found' }, { status: 404 });
        }

        // If marking as hero, unset existing hero for same room/property
        if (isHero) {
            await prisma.media.updateMany({
                where: {
                    isHero: true,
                    id: { not: id },
                    ...(existing.roomId ? { roomId: existing.roomId } : {}),
                    ...(existing.propertyId ? { propertyId: existing.propertyId } : {}),
                },
                data: { isHero: false },
            });
        }

        const updated = await prisma.media.update({
            where: { id },
            data: {
                ...(caption !== undefined ? { caption } : {}),
                ...(sortOrder !== undefined ? { sortOrder } : {}),
                ...(isHero !== undefined ? { isHero } : {}),
                ...(alt !== undefined ? { alt } : {}),
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Media Update Error:', error);
        return NextResponse.json({ error: 'Failed to update media' }, { status: 500 });
    }
}

/**
 * Delete media file and database record.
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });
        }

        const media = await prisma.media.findUnique({ where: { id } });
        if (!media) {
            return NextResponse.json({ error: 'Media not found' }, { status: 404 });
        }

        // Delete file from disk
        try {
            const filePath = join(process.cwd(), 'public', media.url);
            await unlink(filePath);
        } catch (fileError) {
            console.warn('Could not delete file from disk:', fileError);
            // Continue — delete DB record even if file is gone
        }

        // Delete from database
        await prisma.media.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Media Delete Error:', error);
        return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
    }
}

/**
 * Bulk reorder media items.
 * POST /api/admin/media/reorder — body: { items: [{ id, sortOrder }] }
 */
