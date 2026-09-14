import { NextResponse } from "next/server";
import { tick, enqueueDueContent } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";

/**
 * Job tick endpoint for an external scheduler (cron, Railway, Vercel Cron).
 * Protected by JOBS_TICK_SECRET when set.
 */
export async function POST(request: Request) {
  const secret = process.env.JOBS_TICK_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }
  const queued = await enqueueDueContent();
  const processed = await tick(25);
  return NextResponse.json({ queued, processed });
}
