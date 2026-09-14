import { db } from "@/server/db";
import { getPlan, PLANS, type PlanId } from "@/server/plans";
import { currentPeriod } from "@/server/usage";
import { Card, SectionLabel } from "@/components/ui";

export const metadata = { title: "Platform overview" };

export default async function AdminOverview() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [tenants, active, newTenants, tenantPlans, aiUsage, published, campaigns, storage, deadJobs] =
    await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { status: "ACTIVE" } }),
      db.tenant.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      db.tenant.groupBy({ by: ["planId"], _count: true }),
      db.usageRecord.aggregate({
        where: { metric: "ai_text", period: currentPeriod() },
        _sum: { amount: true },
      }),
      db.contentItem.count({ where: { status: "PUBLISHED" } }),
      db.campaign.count(),
      db.asset.aggregate({ _sum: { sizeBytes: true } }),
      db.job.count({ where: { status: "DEAD" } }),
    ]);

  // MRR from the plan table — pricing lives in one place (§37).
  const mrr = tenantPlans.reduce((sum, row) => sum + getPlan(row.planId).priceInrMonthly * row._count, 0);
  const paid = tenantPlans
    .filter((r) => r.planId !== "starter")
    .reduce((s, r) => s + r._count, 0);

  const stats = [
    { label: "Businesses", value: tenants },
    { label: "Active", value: active },
    { label: "New (30 days)", value: newTenants },
    { label: "On a paid plan", value: paid },
    { label: "MRR", value: `₹${mrr.toLocaleString("en-IN")}` },
    { label: "AI calls this month", value: aiUsage._sum.amount ?? 0 },
    { label: "Posts published", value: published },
    { label: "Campaigns created", value: campaigns },
    { label: "Storage used", value: `${Math.round((storage._sum.sizeBytes ?? 0) / 1024 / 1024)} MB` },
    { label: "Failed jobs", value: deadJobs },
  ];

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-[26px] font-bold mb-6">Platform overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint mb-1.5">
              {s.label}
            </div>
            <div className="font-display text-[26px] font-extrabold leading-none tnum">
              {typeof s.value === "number" ? s.value.toLocaleString("en-IN") : s.value}
            </div>
          </Card>
        ))}
      </div>

      <SectionLabel>Plans</SectionLabel>
      <div className="grid sm:grid-cols-3 gap-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const count = tenantPlans.find((p) => p.planId === id)?._count ?? 0;
          return (
            <Card key={id}>
              <div className="font-bold">{PLANS[id].name}</div>
              <div className="text-sm text-ink-soft">
                ₹{PLANS[id].priceInrMonthly.toLocaleString("en-IN")}/mo
              </div>
              <div className="font-display text-2xl font-extrabold mt-2 tnum">{count}</div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
