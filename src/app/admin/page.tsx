import Link from "next/link";
import { db } from "@/server/db";
import { PLANS, type PlanId } from "@/server/plans";
import { platformMetrics } from "@/server/metrics";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Platform overview" };

export default async function AdminOverview() {
  const [m, planCounts, recentSignups] = await Promise.all([
    platformMetrics(),
    db.subscription.groupBy({ by: ["planId", "status"], _count: true }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        emailVerified: true,
        memberships: { select: { tenant: { select: { name: true, slug: true } } }, take: 1 },
      },
    }),
  ]);

  const revenue = [
    { label: "Paying", value: m.payingTenants, tone: "leaf" as const },
    { label: "Trialing", value: m.trialingTenants, tone: "saffron" as const },
    { label: "Past due", value: m.pastDueTenants, tone: "chili" as const },
  ];

  const usage = [
    { label: "Businesses", value: m.tenants },
    { label: "Active", value: m.activeTenants },
    { label: "New (30 days)", value: m.newTenants30d },
    { label: "People signed up", value: m.users },
    { label: "New people (30 days)", value: m.newUsers30d },
    { label: "AI calls this month", value: m.aiCallsThisPeriod },
    { label: "Posts published", value: m.postsPublished },
    { label: "Campaigns created", value: m.campaigns },
    { label: "Storage used", value: `${m.storageMb} MB` },
    { label: "Suspended", value: m.suspendedTenants },
  ];

  const problems = [
    { label: "Failed jobs", value: m.deadJobs },
    { label: "Failed posts", value: m.failedPosts },
  ];

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-[26px] font-bold mb-6">Platform overview</h1>

      <section className="mb-8">
        <SectionLabel>Revenue</SectionLabel>
        <Card className="mb-3">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint mb-1.5">
                Contracted MRR
              </div>
              <div className="font-display text-[40px] font-extrabold leading-none tnum">
                ₹{m.contractedMrrInr.toLocaleString("en-IN")}
              </div>
            </div>
            <div className="flex gap-3">
              {revenue.map((r) => (
                <div key={r.label} className="text-right">
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                    {r.label}
                  </div>
                  <div className="font-display text-2xl font-extrabold tnum">{r.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Never let a dashboard imply money has been collected when it hasn't. */}
          <p className="text-[13px] text-ink-soft mt-4 pt-4 border-t border-line max-w-[70ch]">
            {m.billingConnected ? (
              <>
                Counts only subscriptions in an <b>active</b> billing state. Trialing and past-due
                tenants are excluded.
              </>
            ) : (
              <>
                <b>No payment provider is connected.</b> This figure is what tenants would be billed
                for their assigned plans — not money collected. Wire a provider
                (<code>PAYMENT_PROVIDER</code>) before treating it as revenue.
              </>
            )}
          </p>
        </Card>
      </section>

      <section className="mb-8">
        <SectionLabel>Usage</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {usage.map((s) => (
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
      </section>

      {(m.deadJobs > 0 || m.failedPosts > 0) && (
        <section className="mb-8">
          <SectionLabel>Needs attention</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {problems.map((s) => (
              <Card key={s.label} className={s.value > 0 ? "border-chili" : ""}>
                <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint mb-1.5">
                  {s.label}
                </div>
                <div
                  className={`font-display text-[26px] font-extrabold leading-none tnum ${s.value > 0 ? "text-chili-deep" : ""}`}
                >
                  {s.value}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section>
          <SectionLabel>Plans</SectionLabel>
          <div className="flex flex-col gap-2">
            {(Object.keys(PLANS) as PlanId[]).map((id) => {
              const rows = planCounts.filter((p) => p.planId === id);
              const total = rows.reduce((s, r) => s + r._count, 0);
              const active = rows.find((r) => r.status === "ACTIVE")?._count ?? 0;
              return (
                <Card key={id} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold">{PLANS[id].name}</div>
                    <div className="text-sm text-ink-soft tnum">
                      ₹{PLANS[id].priceInrMonthly.toLocaleString("en-IN")}/mo
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl font-extrabold tnum">{total}</div>
                    <div className="text-[12px] text-ink-faint tnum">{active} paying</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <SectionLabel>Recent sign-ups</SectionLabel>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-3 font-semibold">Person</th>
                  <th className="px-4 py-3 font-semibold">Business</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {recentSignups.map((u) => (
                  <tr key={u.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{u.name ?? "—"}</div>
                      <div className="text-xs text-ink-faint">{u.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.memberships[0] ? (
                        <Link
                          href={`/admin/tenants`}
                          className="text-beet font-semibold hover:underline"
                        >
                          {u.memberships[0].tenant.name}
                        </Link>
                      ) : (
                        <Pill tone="saffron">No business yet</Pill>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap">
                      {formatDate(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      </div>
    </main>
  );
}
