import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const propertyId = formData.get('propertyId') as string;
        const roomId = formData.get('roomId') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const uploadDir = join(process.cwd(), 'public', 'uploads');
        await mkdir(uploadDir, { recursive: true });

        const filename = `${crypto.randomUUID()}-${file.name}`;
        const path = join(uploadDir, filename);
        await writeFile(path, buffer);

        const media = await prisma.media.create({
            data: {
                url: `/uploads/${filename}`,
                alt: file.name,
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

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');
    const propertyId = searchParams.get('propertyId');

    const media = await prisma.media.findMany({
        where: {
            OR: [
                { roomId: roomId || undefined },
                { propertyId: propertyId || undefined }
            ]
        }
    });

    return NextResponse.json(media);
}
