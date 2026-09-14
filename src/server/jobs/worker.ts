import { claimNextJob, completeJob, failJob, enqueue } from "@/server/jobs/queue";
import { runJob } from "@/server/jobs/handlers";
import { db } from "@/server/db";
import { log } from "@/server/logger";

// ── Worker loop ───────────────────────────────────────────────────────────
// In development this runs in-process (JOBS_ENABLED=true). In production the
// same tick function is driven by a separate worker process or a cron ping to
// /api/jobs/tick — the queue is the contract, not the runtime.

let running = false;

/** Processes up to `max` due jobs. Returns how many ran. */
export async function tick(max = 10): Promise<number> {
  if (running) return 0;
  running = true;
  let processed = 0;
  try {
    for (let i = 0; i < max; i++) {
      const job = await claimNextJob();
      if (!job) break;
      try {
        await runJob(job);
        await completeJob(job.id);
      } catch (err) {
        await failJob(job.id, err instanceof Error ? err.message : String(err));
      }
      processed++;
    }
  } finally {
    running = false;
  }
  return processed;
}

/** Queues publish jobs for everything whose scheduled time has arrived. */
export async function enqueueDueContent(): Promise<number> {
  const due = await db.contentItem.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true, tenantId: true },
    take: 50,
  });

  for (const item of due) {
    const existing = await db.job.findFirst({
      where: {
        type: "publish_content",
        status: { in: ["PENDING", "RUNNING"] },
        payload: { path: ["contentItemId"], equals: item.id },
      },
    });
    if (existing) continue;
    await enqueue({
      type: "publish_content",
      tenantId: item.tenantId,
      payload: { contentItemId: item.id },
    });
  }
  return due.length;
}

/** Queues the daily token-refresh pass if one hasn't run in the last day. */
export async function enqueueDailyMaintenance(): Promise<void> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.job.findFirst({
    where: { type: "refresh_tokens", createdAt: { gte: dayAgo } },
    select: { id: true },
  });
  if (!recent) await enqueue({ type: "refresh_tokens", payload: {}, maxAttempts: 2 });
}

let interval: NodeJS.Timeout | null = null;

/** Dev convenience: poll every 30s inside the Next.js server process. */
export function startInProcessWorker(): void {
  if (interval || process.env.JOBS_ENABLED !== "true") return;
  interval = setInterval(async () => {
    try {
      await enqueueDailyMaintenance();
      await enqueueDueContent();
      const n = await tick();
      if (n > 0) log.info({ operation: "worker.tick", status: "ok", processed: n });
    } catch (err) {
      log.error({
        operation: "worker.tick",
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, 30_000);
}
