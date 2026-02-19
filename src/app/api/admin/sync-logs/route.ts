import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Admin API for viewing webhook/sync logs
 * 
 * GET /api/admin/sync-logs
 * 
 * Query params:
 *   direction: "INCOMING" | "OUTGOING" | "ALL" (default: ALL)
 *   status:    "SUCCESS" | "ERROR" | "ALL" (default: ALL)
 *   source:    "BEDS24" | "ZOHO" | "ALL" (default: ALL)
 *   limit:     number (default: 50, max: 200)
 *   offset:    number (default: 0)
 * 
 * DELETE /api/admin/sync-logs?olderThan=30  (delete logs older than 30 days)
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const direction = searchParams.get('direction') || 'ALL';
    const status = searchParams.get('status') || 'ALL';
    const source = searchParams.get('source') || 'ALL';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, any> = {};
    if (direction !== 'ALL') where.direction = direction;
    if (status !== 'ALL') where.status = status;
    if (source !== 'ALL') where.source = source;

    const [logs, total] = await Promise.all([
        prisma.webhookLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        }),
        prisma.webhookLog.count({ where }),
    ]);

    // Stats summary
    const stats = await prisma.webhookLog.groupBy({
        by: ['status'],
        _count: true,
        where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
    });

    const summary = {
        last24h: stats.reduce((acc, s) => {
            acc[s.status.toLowerCase()] = s._count;
            return acc;
        }, {} as Record<string, number>),
        total,
    };

    return NextResponse.json({ summary, logs, pagination: { limit, offset, total } });
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const olderThanDays = parseInt(searchParams.get('olderThan') || '30');

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const { count } = await prisma.webhookLog.deleteMany({
        where: { createdAt: { lt: cutoff } }
    });

    return NextResponse.json({ deleted: count, olderThan: `${olderThanDays} days`, cutoffDate: cutoff.toISOString() });
}
