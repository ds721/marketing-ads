import { db } from "@/server/db";
import { log } from "@/server/logger";
import type { Prisma } from "@prisma/client";

// ── Background job queue (§35) ────────────────────────────────────────────
// Postgres-backed so the app keeps working with the browser closed and a
// crash never loses a scheduled post. The row IS the lock: claiming uses a
// conditional update, so two workers can't run the same job.

export type JobType =
  | "publish_content"
  | "generate_strategy"
  | "collect_analytics"
  | "refresh_tokens"
  | "notify";

const STALE_LOCK_MS = 5 * 60 * 1000;

export async function enqueue(params: {
  type: JobType;
  tenantId?: string | null;
  payload: Prisma.InputJsonValue;
  runAt?: Date;
  maxAttempts?: number;
}): Promise<string> {
  const job = await db.job.create({
    data: {
      type: params.type,
      tenantId: params.tenantId ?? null,
      payload: params.payload,
      runAt: params.runAt ?? new Date(),
      maxAttempts: params.maxAttempts ?? 3,
    },
  });
  return job.id;
}

/** Claim one due job atomically. Returns null when nothing is ready. */
export async function claimNextJob() {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const candidate = await db.job.findFirst({
    where: {
      runAt: { lte: new Date() },
      OR: [
        { status: "PENDING" },
        // Recover jobs whose worker died mid-run.
        { status: "RUNNING", lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { runAt: "asc" },
  });
  if (!candidate) return null;

  const claimed = await db.job.updateMany({
    where: { id: candidate.id, status: candidate.status, lockedAt: candidate.lockedAt },
    data: { status: "RUNNING", lockedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null; // lost the race to another worker

  return db.job.findUnique({ where: { id: candidate.id } });
}

export async function completeJob(id: string) {
  await db.job.update({
    where: { id },
    data: { status: "SUCCEEDED", completedAt: new Date(), lockedAt: null, lastError: null },
  });
}

/** Exponential backoff; a job that exhausts its attempts becomes DEAD, not lost. */
export async function failJob(id: string, error: string) {
  const job = await db.job.findUnique({ where: { id } });
  if (!job) return;

  if (job.attempts >= job.maxAttempts) {
    await db.job.update({
      where: { id },
      data: { status: "DEAD", lastError: error.slice(0, 500), lockedAt: null },
    });
    log.error({ operation: "job.dead", tenantId: job.tenantId, status: "error", error, jobType: job.type });
    return;
  }

  const backoffMs = Math.min(60_000 * 2 ** (job.attempts - 1), 30 * 60_000);
  await db.job.update({
    where: { id },
    data: {
      status: "PENDING",
      runAt: new Date(Date.now() + backoffMs),
      lastError: error.slice(0, 500),
      lockedAt: null,
    },
  });
}
