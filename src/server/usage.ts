import { db } from "@/server/db";
import { getPlan, type UsageMetric } from "@/server/plans";

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export class UsageLimitError extends Error {
  constructor(
    public metric: UsageMetric,
    public limit: number,
  ) {
    super(`Usage limit reached for ${metric} (${limit}/month on this plan)`);
    this.name = "UsageLimitError";
  }
}

async function usedThisPeriod(tenantId: string, metric: UsageMetric): Promise<number> {
  const agg = await db.usageRecord.aggregate({
    where: { tenantId, metric, period: currentPeriod() },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export async function getRemainingUsage(tenantId: string, metric: UsageMetric) {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const limit = getPlan(tenant.planId).limits[metric];
  const used = await usedThisPeriod(tenantId, metric);
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/** Throws UsageLimitError when the tenant's plan has no headroom left. */
export async function checkEntitlement(tenantId: string, metric: UsageMetric, amount = 1) {
  const { limit, used } = await getRemainingUsage(tenantId, metric);
  if (used + amount > limit) throw new UsageLimitError(metric, limit);
}

export async function recordUsage(tenantId: string, metric: UsageMetric, amount = 1) {
  await db.usageRecord.create({
    data: { tenantId, metric, amount, period: currentPeriod() },
  });
}
