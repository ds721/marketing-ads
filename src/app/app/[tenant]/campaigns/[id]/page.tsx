import { notFound } from "next/navigation";
import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { Card, Pill, StatusPill, PlatformBadge, SectionLabel } from "@/components/ui";
import { CampaignActions } from "@/components/campaign-actions";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Campaign" };

const FACT_LABELS: Record<string, string> = {
  offerName: "Offer",
  price: "Price",
  discount: "Discount",
  startDate: "Starts",
  endDate: "Ends",
  daysOrTimes: "When",
};

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const ctx = await requireTenant(slug);
  const canEdit = roleAtLeast(ctx.role, "EDITOR");

  const campaign = await db.campaign.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      contentItems: { orderBy: { scheduledAt: "asc" } },
      idea: true,
    },
  });
  if (!campaign) notFound();

  const facts = (campaign.facts as Record<string, string | null> | null) ?? {};
  const statedFacts = Object.entries(facts).filter(([, v]) => v);
  const proposal = campaign.proposal as { rationale?: string } | null;
  const isProposal = campaign.status === "PROPOSED";

  return (
    <main className="px-6 md:px-10 py-8 max-w-4xl">
      <PageHeader
        title={campaign.name}
        subtitle={campaign.objective ?? undefined}
        action={<StatusBadge status={campaign.status} />}
      />

      {campaign.idea && (
        <Card className="mb-5">
          <SectionLabel>You said</SectionLabel>
          <p className="text-[15px]">&ldquo;{campaign.idea.text}&rdquo;</p>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Fact label="Runs" value={`${formatDate(campaign.startsAt)} → ${formatDate(campaign.endsAt)}`} />
        <Fact label="Audience" value={campaign.audience ?? "—"} />
        <Fact label="Channels" value={campaign.channels.join(" · ") || "—"} />
        <Fact label="Pieces" value={String(campaign.contentItems.length)} />
      </div>

      {statedFacts.length > 0 && (
        <Card className="mb-5">
          <SectionLabel>Locked facts</SectionLabel>
          <div className="flex flex-wrap gap-2 mb-3">
            {statedFacts.map(([k, v]) => (
              <Pill key={k} tone="leaf">
                <b>{FACT_LABELS[k] ?? k}:</b> {v}
              </Pill>
            ))}
          </div>
          <p className="text-[13px] text-ink-soft">
            These come from your own words and are placed on every asset by Markit — not drawn by an
            image model. ₹199 can never become ₹1,999.
          </p>
        </Card>
      )}

      {proposal?.rationale && (
        <Card className="mb-5 bg-surface-2">
          <SectionLabel>Why this plan</SectionLabel>
          <p className="text-[14.5px]">{proposal.rationale}</p>
        </Card>
      )}

      <SectionLabel>What we&apos;ll publish</SectionLabel>
      <div className="flex flex-col gap-2.5 mb-6">
        {campaign.contentItems.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start gap-3">
              <PlatformBadge platform={item.platform} size={28} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-sm">{item.title}</span>
                  <Pill>{item.contentType.toLowerCase()}</Pill>
                </div>
                {item.hook && (
                  <p className="text-[14px] font-semibold text-beet-deep mb-1">{item.hook}</p>
                )}
                <p className="text-[14.5px] whitespace-pre-wrap">{item.body}</p>
                {item.hashtags.length > 0 && (
                  <p className="text-[13px] text-peacock-deep mt-1.5">{item.hashtags.join(" ")}</p>
                )}
                <div className="text-xs text-ink-faint mt-2">
                  {item.cta ? `${item.cta} · ` : ""}
                  {formatDateTime(item.scheduledAt)}
                </div>
              </div>
              <StatusPill status={item.status} />
            </div>
          </Card>
        ))}
      </div>

      {canEdit && isProposal && <CampaignActions slug={slug} campaignId={campaign.id} />}
      {canEdit && !isProposal && campaign.status === "ACTIVE" && (
        <Card className="bg-leaf-tint border-0">
          <p className="text-[14.5px] text-leaf-deep font-semibold">
            Approved. You can see and adjust every piece on your calendar.
          </p>
        </Card>
      )}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-[12px] px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint">{label}</div>
      <div className="text-sm font-semibold truncate tnum">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "PROPOSED" ? "saffron" : status === "ACTIVE" ? "leaf" : status === "REJECTED" ? "chili" : "neutral";
  const label =
    status === "PROPOSED" ? "Waiting for your approval" : status.charAt(0) + status.slice(1).toLowerCase();
  return <Pill tone={tone as "saffron" | "leaf" | "chili" | "neutral"}>{label}</Pill>;
}
