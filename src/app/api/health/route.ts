import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Public liveness/readiness probe for Stef monitoring. Returns no secrets and does no heavy work.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, app: "beds25", db: "ok", ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[health] database check failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, app: "beds25", db: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
