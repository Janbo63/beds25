import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['HERO', 'GALLERY', 'THUMBNAIL', 'PROPERTY'];

/**
 * Upload a typed room image.
 * POST /api/admin/room-images
 * FormData: file, roomId, type (HERO|GALLERY|THUMBNAIL|PROPERTY), altText
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const roomId = formData.get('roomId') as string;
        const type = (formData.get('type') as string)?.toUpperCase() ?? 'GALLERY';
        const altText = formData.get('altText') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }
        if (!roomId) {
            return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
        }
        if (!VALID_TYPES.includes(type)) {
            return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const uploadDir = join(process.cwd(), 'public', 'uploads', 'rooms');
        await mkdir(uploadDir, { recursive: true });

        const filename = `${crypto.randomUUID()}-${file.name}`;
        const path = join(uploadDir, filename);
        await writeFile(path, buffer);

        // Auto-increment sortOrder within room+type
        const maxOrder = await prisma.roomImage.aggregate({
            _max: { sortOrder: true },
            where: { roomId, type },
        });
        const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

        const image = await prisma.roomImage.create({
            data: {
                roomId,
                url: `/uploads/rooms/${filename}`,
                type,
                altText: altText || file.name,
                sortOrder,
                active: true,
            },
        });

        return NextResponse.json(image);
    } catch (error) {
        console.error('[RoomImages] Upload Error:', error);
        return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }
}

/**
 * List room images, optionally filtered by type.
 * GET /api/admin/room-images?roomId=xxx&type=GALLERY
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');
    const type = searchParams.get('type')?.toUpperCase();

    const where: { roomId?: string; type?: string } = {};
    if (roomId) where.roomId = roomId;
    if (type && VALID_TYPES.includes(type)) where.type = type;

    const images = await prisma.roomImage.findMany({
        where,
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    return NextResponse.json(images);
}

/**
 * Update room image metadata (type, altText, sortOrder, active).
 * PATCH /api/admin/room-images
 * JSON body: { id, type?, altText?, sortOrder?, active? }
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, type, altText, sortOrder, active } = body;

        if (!id) {
            return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
        }

        if (type && !VALID_TYPES.includes(type.toUpperCase())) {
            return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
        }

        const updated = await prisma.roomImage.update({
            where: { id },
            data: {
                ...(type !== undefined ? { type: type.toUpperCase() } : {}),
                ...(altText !== undefined ? { altText } : {}),
                ...(sortOrder !== undefined ? { sortOrder } : {}),
                ...(active !== undefined ? { active } : {}),
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('[RoomImages] Update Error:', error);
        return NextResponse.json({ error: 'Failed to update image' }, { status: 500 });
    }
}

/**
 * Delete a room image (file + DB record).
 * DELETE /api/admin/room-images?id=xxx
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
        }

        const image = await prisma.roomImage.findUnique({ where: { id } });
        if (!image) {
            return NextResponse.json({ error: 'Image not found' }, { status: 404 });
        }

        // Delete file from disk
        try {
            const filePath = join(process.cwd(), 'public', image.url);
            await unlink(filePath);
        } catch {
            console.warn('[RoomImages] File not found on disk, continuing with DB delete');
        }

        await prisma.roomImage.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[RoomImages] Delete Error:', error);
        return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
    }
}
