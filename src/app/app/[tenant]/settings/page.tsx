import { requireTenant } from "@/server/tenant";
import { db } from "@/server/db";
import { getPlan } from "@/server/plans";
import { getRemainingUsage } from "@/server/usage";
import { PageHeader } from "@/components/page-header";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { AutomationForm } from "@/components/automation-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const ctx = await requireTenant(slug, "ADMIN");

  const [automation, members, plan, aiUsage, postUsage] = await Promise.all([
    db.automationSettings.findUniqueOrThrow({ where: { tenantId: ctx.tenant.id } }),
    db.tenantUser.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    Promise.resolve(getPlan(ctx.tenant.planId)),
    getRemainingUsage(ctx.tenant.id, "ai_text"),
    getRemainingUsage(ctx.tenant.id, "posts_published"),
  ]);

  return (
    <main className="px-6 md:px-10 py-8 max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="How much Markit does on its own — and how much waits for you."
      />

      <section className="mb-8">
        <SectionLabel>How Markit works for you</SectionLabel>
        <AutomationForm
          slug={slug}
          defaults={{
            level: automation.level,
            aiReplanning: automation.aiReplanning,
            requireApprovalForPromotions: automation.requireApprovalForPromotions,
            maxPostsPerWeek: automation.maxPostsPerWeek,
            quietHoursStart: automation.quietHoursStart,
            quietHoursEnd: automation.quietHoursEnd,
            paused: automation.paused,
          }}
        />
      </section>

      <section className="mb-8">
        <SectionLabel>Your plan</SectionLabel>
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div>
              <div className="font-bold text-lg">{plan.name}</div>
              <div className="text-sm text-ink-soft">
                ₹{plan.priceInrMonthly.toLocaleString("en-IN")} / month
              </div>
            </div>
            <Pill tone="beet">{ctx.tenant.planId}</Pill>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <UsageBar label="AI generations" used={aiUsage.used} limit={aiUsage.limit} />
            <UsageBar label="Posts published" used={postUsage.used} limit={postUsage.limit} />
          </div>
        </Card>
      </section>

      <section>
        <SectionLabel>People</SectionLabel>
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <Card key={m.id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-semibold text-sm">{m.user.name ?? m.user.email}</div>
                <div className="text-xs text-ink-soft">{m.user.email}</div>
              </div>
              <Pill tone={m.role === "OWNER" ? "beet" : "neutral"}>{m.role.toLowerCase()}</Pill>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div>
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
}
