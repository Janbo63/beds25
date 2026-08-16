import { NextRequest, NextResponse } from 'next/server';
import zohoClient from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/zoho-query
 * Retrieves a single record from Zoho CRM by ID or lists available modules.
 * 
 * Usage:
 * - GET /api/admin/zoho-query?module=Bookings&id=884394000001883002
 * 
 * @param req NextRequest
 * @returns NextResponse
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const module = searchParams.get('module');
    const id = searchParams.get('id');

    if (!module) {
        return NextResponse.json({
            message: "Zoho CRM Query Endpoint",
            usage: {
                GET: "/api/admin/zoho-query?module=<MODULE>&id=<RECORD_ID>",
                POST: "Send { 'query': 'select ... from Bookings where ...' } to run a COQL search.",
            },
            modules: ["Bookings", "Rooms", "Guests", "Properties"],
            example: "/api/admin/zoho-query?module=Bookings&id=884394000001883002"
        });
    }

    if (!id) {
        return NextResponse.json({ error: "Missing 'id' parameter." }, { status: 400 });
    }

    try {
        const record = await zohoClient.getRecord(module, id);
        return NextResponse.json({ data: record });
    } catch (error: any) {
        console.error("Zoho GET Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch record from Zoho." }, 
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/zoho-query
 * Executes a COQL search query against Zoho CRM.
 * 
 * Body:
 * { "query": "select ... from Bookings where ..." }
 * 
 * @param req NextRequest
 * @returns NextResponse
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { query } = body;

        if (!query) {
            return NextResponse.json(
                { error: "Missing 'query' property in request body." }, 
                { status: 400 }
            );
        }

        const response = await zohoClient.searchRecords(query);
        return NextResponse.json(response);
    } catch (error: any) {
        console.error("Zoho POST Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to execute COQL query." }, 
            { status: 500 }
        );
    }
}
