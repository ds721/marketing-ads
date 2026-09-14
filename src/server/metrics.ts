import { db } from "@/server/db";
import { getPlan } from "@/server/plans";
import { currentPeriod } from "@/server/usage";

// ── Platform metrics (§31) ────────────────────────────────────────────────
// Revenue figures must reflect what is actually contracted, not what plans
// happen to be assigned. A tenant on a Growth plan that is still TRIALING has
// paid nothing, and counting it as revenue would make the number a fiction.

export interface PlatformMetrics {
  tenants: number;
  activeTenants: number;
  suspendedTenants: number;
  newTenants30d: number;
  users: number;
  newUsers30d: number;
  /** Sum of plan prices for subscriptions that are actually billing. */
  contractedMrrInr: number;
  payingTenants: number;
  trialingTenants: number;
  pastDueTenants: number;
  /** True once a payment provider is wired; until then MRR is contracted, not collected. */
  billingConnected: boolean;
  aiCallsThisPeriod: number;
  postsPublished: number;
  campaigns: number;
  storageMb: number;
  deadJobs: number;
  failedPosts: number;
}

export async function platformMetrics(): Promise<PlatformMetrics> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [
    tenants,
    activeTenants,
    suspendedTenants,
    newTenants30d,
    users,
    newUsers30d,
    subscriptions,
    aiUsage,
    postsPublished,
    campaigns,
    storage,
    deadJobs,
    failedPosts,
  ] = await Promise.all([
    db.tenant.count(),
    db.tenant.count({ where: { status: "ACTIVE" } }),
    db.tenant.count({ where: { status: "SUSPENDED" } }),
    db.tenant.count({ where: { createdAt: { gte: since } } }),
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.subscription.findMany({
      select: { planId: true, status: true, tenant: { select: { status: true } } },
    }),
    db.usageRecord.aggregate({
      where: { metric: "ai_text", period: currentPeriod() },
      _sum: { amount: true },
    }),
    db.contentItem.count({ where: { status: "PUBLISHED" } }),
    db.campaign.count(),
    db.asset.aggregate({ _sum: { sizeBytes: true } }),
    db.job.count({ where: { status: "DEAD" } }),
    db.contentItem.count({ where: { status: "FAILED" } }),
  ]);

  // Only ACTIVE subscriptions on non-suspended tenants represent real revenue.
  const billing = subscriptions.filter((s) => s.tenant.status === "ACTIVE");
  const paying = billing.filter((s) => s.status === "ACTIVE");

  return {
    tenants,
    activeTenants,
    suspendedTenants,
    newTenants30d,
    users,
    newUsers30d,
    contractedMrrInr: paying.reduce((sum, s) => sum + getPlan(s.planId).priceInrMonthly, 0),
    payingTenants: paying.length,
    trialingTenants: billing.filter((s) => s.status === "TRIALING").length,
    pastDueTenants: billing.filter((s) => s.status === "PAST_DUE").length,
    billingConnected: Boolean(process.env.PAYMENT_PROVIDER),
    aiCallsThisPeriod: aiUsage._sum.amount ?? 0,
    postsPublished,
    campaigns,
    storageMb: Math.round((storage._sum.sizeBytes ?? 0) / 1024 / 1024),
    deadJobs,
    failedPosts,
  };
}

/** Everything the admin needs about one client, in one round of queries. */
export async function tenantDetail(tenantId: string) {
  const [tenant, contentByStatus, campaigns, assets, usage, recentAudit, lastActivity] =
    await Promise.all([
      db.tenant.findUnique({
        where: { id: tenantId },
        include: {
          businessProfile: true,
          subscription: true,
          automation: true,
          members: {
            include: { user: { select: { email: true, name: true, createdAt: true } } },
            orderBy: { createdAt: "asc" },
          },
          _count: { select: { products: true, offers: true, socialAccounts: true } },
        },
      }),
      db.contentItem.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: true,
      }),
      db.campaign.count({ where: { tenantId } }),
      db.asset.aggregate({ where: { tenantId }, _sum: { sizeBytes: true }, _count: true }),
      db.usageRecord.groupBy({
        by: ["metric"],
        where: { tenantId, period: currentPeriod() },
        _sum: { amount: true },
      }),
      db.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      db.contentItem.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

  if (!tenant) return null;

  return {
    tenant,
    contentByStatus: Object.fromEntries(contentByStatus.map((r) => [r.status, r._count])),
    campaigns,
    assetCount: assets._count,
    storageMb: Math.round((assets._sum.sizeBytes ?? 0) / 1024 / 1024),
    usage: Object.fromEntries(usage.map((r) => [r.metric, r._sum.amount ?? 0])),
    recentAudit,
    lastActivityAt: lastActivity?.createdAt ?? null,
  };
}
