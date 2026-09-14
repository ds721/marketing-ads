import Link from "next/link";
import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { performanceByTopic } from "@/server/marketing/insights";
import { PageHeader } from "@/components/page-header";
import { Card, EmptyState, SectionLabel, btnStyles, Pill } from "@/components/ui";
import { GenerateInsightsButton } from "@/components/insights-button";
import { getPlan } from "@/server/plans";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const ctx = await requireTenant(slug);
  const plan = getPlan(ctx.tenant.planId);

  const [connected, totals, rows, insights, publishedCount] = await Promise.all([
    db.socialAccount.count({ where: { tenantId: ctx.tenant.id, status: "CONNECTED" } }),
    db.analyticsSnapshot.aggregate({
      where: { tenantId: ctx.tenant.id },
      _sum: { reach: true, engagement: true, clicks: true, leads: true, bookings: true },
    }),
    performanceByTopic(ctx.tenant.id),
    db.aiInsight.findMany({
      where: { tenantId: ctx.tenant.id, status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.contentItem.count({ where: { tenantId: ctx.tenant.id, status: "PUBLISHED" } }),
  ]);

  if (!plan.features.analytics) {
    return (
      <main className="px-6 md:px-10 py-8 max-w-3xl">
        <PageHeader title="Results" />
        <EmptyState
          title="Analytics comes with Growth"
          body="Upgrade to see what's working, which content brings customers in, and what the AI suggests doing more of."
          action={
            <Link href={`/app/${slug}/settings`} className={btnStyles.primary}>
              See plans
            </Link>
          }
        />
      </main>
    );
  }

  const metrics = [
    { label: "People reached", value: totals._sum.reach ?? 0, tone: "peacock" as const },
    { label: "Interactions", value: totals._sum.engagement ?? 0, tone: "beet" as const },
    { label: "Clicks", value: totals._sum.clicks ?? 0, tone: "saffron" as const },
    { label: "Bookings", value: totals._sum.bookings ?? 0, tone: "leaf" as const },
  ];

  const hasData = metrics.some((m) => m.value > 0);

  return (
    <main className="px-6 md:px-10 py-8 max-w-4xl">
      <PageHeader
        title="What's working"
        subtitle="Plain numbers, no marketing jargon."
        action={roleAtLeast(ctx.role, "ADMIN") && hasData ? <GenerateInsightsButton slug={slug} /> : undefined}
      />

      {connected === 0 && (
        <Card className="mb-6 bg-saffron-tint border-0">
          <div className="font-bold text-saffron-deep mb-1">No platforms connected yet</div>
          <p className="text-[14px] text-saffron-deep mb-3">
            Results come from the platforms you post to. Until one is connected, there are no real
            numbers to show — and we won&apos;t invent any.
          </p>
          <Link href={`/app/${slug}/integrations`} className={btnStyles.primary}>
            Connect a platform
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {metrics.map((m) => (
          <Card key={m.label}>
            <div className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-faint mb-2">
              {m.label}
            </div>
            <div className="font-display text-[32px] font-extrabold leading-none tnum">
              {m.value.toLocaleString("en-IN")}
            </div>
          </Card>
        ))}
      </div>

      {insights.length > 0 && (
        <section className="mb-8">
          <SectionLabel>What the AI noticed</SectionLabel>
          <div className="flex flex-col gap-2.5">
            {insights.map((i) => (
              <Card
                key={i.id}
                className={i.kind === "recommendation" ? "bg-gradient-to-br from-beet-tint to-peacock-tint border-line" : ""}
              >
                <div className="flex items-start gap-3">
                  <Pill tone={i.kind === "recommendation" ? "beet" : "peacock"}>
                    {i.kind === "recommendation" ? "Suggestion" : "Insight"}
                  </Pill>
                  <div className="flex-1">
                    <div className="font-bold mb-1">{i.title}</div>
                    <p className="text-[14.5px]">{i.body}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionLabel>Your content, ranked</SectionLabel>
        {rows.length === 0 ? (
          <EmptyState
            title={publishedCount === 0 ? "Nothing published yet" : "Waiting on results"}
            body={
              publishedCount === 0
                ? "Once your posts start going out, you'll see which ones bring people in."
                : "Your posts are live. Results appear here as the platforms report them back."
            }
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-3 font-semibold">Content</th>
                  <th className="px-4 py-3 font-semibold text-right">Reached</th>
                  <th className="px-4 py-3 font-semibold text-right">Interactions</th>
                  <th className="px-4 py-3 font-semibold text-right">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.topic} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium">{r.topic}</td>
                    <td className="px-4 py-3 text-right tnum">{r.reach.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tnum">{r.engagement.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tnum font-semibold text-leaf-deep">
                      {r.bookings}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </main>
  );
}
