import Link from "next/link";
import { requireTenant } from "@/server/tenant";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { Card, EmptyState, Pill, btnStyles } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Campaigns" };

const TONE: Record<string, "saffron" | "leaf" | "chili" | "neutral"> = {
  PROPOSED: "saffron",
  ACTIVE: "leaf",
  APPROVED: "leaf",
  REJECTED: "chili",
  COMPLETED: "neutral",
  ARCHIVED: "neutral",
};

export default async function CampaignsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const ctx = await requireTenant(slug);

  const campaigns = await db.campaign.findMany({
    where: { tenantId: ctx.tenant.id, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contentItems: true } } },
    take: 50,
  });

  return (
    <main className="px-6 md:px-10 py-8 max-w-4xl">
      <PageHeader
        title="Campaigns"
        subtitle="Everything the AI has put together for you, newest first."
        action={
          <Link href={`/app/${slug}/ideas/new`} className={btnStyles.idea}>
            + New Marketing Idea
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          body="Tell the AI what's happening in your business — a new offer, an event, a quiet Tuesday — and it builds the campaign for you."
          action={
            <Link href={`/app/${slug}/ideas/new`} className={btnStyles.primary}>
              Start with an idea
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/app/${slug}/campaigns/${c.id}`}>
              <Card className="flex items-center justify-between gap-4 hover:shadow-lift transition-shadow">
                <div className="min-w-0">
                  <div className="font-bold truncate">{c.name}</div>
                  <div className="text-[13px] text-ink-soft truncate">
                    {c.objective ?? "—"}
                  </div>
                  <div className="text-xs text-ink-faint mt-1">
                    {formatDate(c.startsAt)} → {formatDate(c.endsAt)} · {c._count.contentItems} pieces ·{" "}
                    {c.channels.join(", ") || "no channels"}
                  </div>
                </div>
                <Pill tone={TONE[c.status] ?? "neutral"}>
                  {c.status === "PROPOSED" ? "Needs approval" : c.status.toLowerCase()}
                </Pill>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
