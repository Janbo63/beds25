import { NextRequest, NextResponse } from 'next/server';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * Quick Zoho record lookup.
 * GET /api/public/zoho-lookup?key=beds25-zoho-lookup&id=884394000001883002
 */
export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    const id = params.get('id');

    if (key !== 'beds25-zoho-lookup') {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    if (!id) {
        return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    try {
        const record = await zohoClient.getRecord('Bookings', id);
        return NextResponse.json({
            zohoId: id,
            record: record || 'NOT_FOUND',
        });
    } catch (err: any) {
        return NextResponse.json({
            zohoId: id,
            error: err.message,
        }, { status: 500 });
    }
}
