import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/server/tenant";
import { tenantDetail } from "@/server/metrics";
import { getPlan } from "@/server/plans";
import { audit } from "@/server/audit";
import { Card, SectionLabel, Pill, StatusPill } from "@/components/ui";
import { TenantAdminActions } from "@/components/admin-actions";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { ContentStatus } from "@prisma/client";

export const metadata = { title: "Business detail" };

const SUB_TONE: Record<string, "leaf" | "saffron" | "chili" | "neutral"> = {
  ACTIVE: "leaf",
  TRIALING: "saffron",
  PAST_DUE: "chili",
  CANCELED: "neutral",
};

export default async function AdminTenantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  const detail = await tenantDetail(id);
  if (!detail) notFound();

  // Looking at a customer's account is a privileged action, so it's recorded
  // the same way a change would be.
  await audit({
    tenantId: id,
    userId: admin.id,
    action: "admin.tenant.view",
    targetType: "tenant",
    targetId: id,
  });

  const { tenant, contentByStatus, campaigns, assetCount, storageMb, usage, recentAudit, lastActivityAt } =
    detail;
  const plan = getPlan(tenant.planId);
  const profile = tenant.businessProfile;

  const limits = [
    { metric: "ai_text" as const, label: "AI generations" },
    { metric: "ai_image" as const, label: "AI images" },
    { metric: "posts_published" as const, label: "Posts published" },
    { metric: "campaigns" as const, label: "Campaigns" },
  ];

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <Link href="/admin/tenants" className="text-sm text-ink-soft hover:text-ink">
        ← All businesses
      </Link>

      <header className="flex items-start justify-between gap-4 flex-wrap mt-3 mb-6">
        <div>
          <h1 className="text-[26px] font-bold">{tenant.name}</h1>
          <p className="text-sm text-ink-soft mt-1">
            <Link href={`/${tenant.slug}`} className="text-beet font-semibold hover:underline">
              /{tenant.slug}
            </Link>
            {profile?.category ? ` · ${profile.category}` : ""}
            {profile?.city ? ` · ${profile.city}` : ""}
            {" · joined "}
            {formatDate(tenant.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone={tenant.status === "ACTIVE" ? "leaf" : "chili"}>
            {tenant.status.toLowerCase()}
          </Pill>
          <TenantAdminActions tenantId={tenant.id} status={tenant.status} planId={tenant.planId} />
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Plan" value={plan.name} />
        <Stat
          label="Billing"
          value={tenant.subscription?.status.toLowerCase() ?? "none"}
          tone={SUB_TONE[tenant.subscription?.status ?? ""] ?? "neutral"}
        />
        <Stat label="Campaigns" value={String(campaigns)} />
        <Stat
          label="Last activity"
          value={lastActivityAt ? formatDate(lastActivityAt) : "never"}
          tone={lastActivityAt ? "neutral" : "saffron"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section>
          <SectionLabel>Usage this month</SectionLabel>
          <Card>
            <div className="flex flex-col gap-3">
              {limits.map(({ metric, label }) => {
                const used = usage[metric] ?? 0;
                const limit = plan.limits[metric];
                const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
                return (
                  <div key={metric}>
                    <div className="flex justify-between text-[13px] mb-1.5">
                      <span className="font-semibold">{label}</span>
                      <span className="text-ink-soft tnum">
                        {used} / {limit}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 85 ? "bg-chili" : "bg-leaf"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between text-[13px] pt-2 border-t border-line">
                <span className="font-semibold">Storage</span>
                <span className="text-ink-soft tnum">
                  {storageMb} / {plan.limits.storage_mb} MB · {assetCount} files
                </span>
              </div>
            </div>
          </Card>

          <SectionLabel>Content</SectionLabel>
          <Card>
            {Object.keys(contentByStatus).length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing created yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(contentByStatus).map(([status, count]) => (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <StatusPill status={status as ContentStatus} />
                    <span className="text-sm font-bold tnum">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          <SectionLabel>Setup</SectionLabel>
          <Card>
            <dl className="text-sm flex flex-col gap-2">
              <Row label="Onboarded" value={profile?.onboardedAt ? formatDate(profile.onboardedAt) : "Not finished"} />
              <Row label="Products & services" value={String(tenant._count.products)} />
              <Row label="Offers" value={String(tenant._count.offers)} />
              <Row label="Connected platforms" value={String(tenant._count.socialAccounts)} />
              <Row label="Automation" value={tenant.automation?.level.toLowerCase() ?? "—"} />
              <Row label="Contact" value={profile?.phone ?? profile?.email ?? "—"} />
            </dl>
          </Card>
        </section>

        <section>
          <SectionLabel>People</SectionLabel>
          <Card className="mb-6">
            <div className="flex flex-col gap-2.5">
              {tenant.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {m.user.name ?? m.user.email}
                    </div>
                    <div className="text-xs text-ink-faint truncate">{m.user.email}</div>
                  </div>
                  <Pill tone={m.role === "OWNER" ? "beet" : "neutral"}>{m.role.toLowerCase()}</Pill>
                </div>
              ))}
            </div>
          </Card>

          <SectionLabel>Recent activity</SectionLabel>
          <Card className="p-0 overflow-hidden">
            {recentAudit.length === 0 ? (
              <p className="text-sm text-ink-soft p-5">No recorded activity.</p>
            ) : (
              <ul>
                {recentAudit.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line last:border-0"
                  >
                    <span className="text-[13px] font-semibold">{entry.action}</span>
                    <span className="text-xs text-ink-faint whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "leaf" | "saffron" | "chili";
}) {
  const colors = {
    neutral: "",
    leaf: "text-leaf-deep",
    saffron: "text-saffron-deep",
    chili: "text-chili-deep",
  };
  return (
    <Card>
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint mb-1.5">
        {label}
      </div>
      <div className={`font-bold text-lg capitalize ${colors[tone]}`}>{value}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold text-right">{value}</dd>
    </div>
  );
}
