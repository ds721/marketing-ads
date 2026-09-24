import { NextResponse } from "next/server";
import { tick, enqueueDueContent, enqueueDailyMaintenance } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";

/**
 * Job tick for an external scheduler. Vercel Cron calls it with GET and its
 * own CRON_SECRET; other schedulers can POST with JOBS_TICK_SECRET. Without
 * either secret set it is open — fine locally, never in production.
 */
async function tickHandler(request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.JOBS_TICK_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  await enqueueDailyMaintenance();
  const queued = await enqueueDueContent();
  const processed = await tick(25);
  return NextResponse.json({ queued, processed });
}

export const GET = tickHandler;
export const POST = tickHandler;
