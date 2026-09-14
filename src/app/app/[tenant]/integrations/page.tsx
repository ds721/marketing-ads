import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { platformStatuses } from "@/server/social";
import { PageHeader } from "@/components/page-header";
import { Card, Pill, PlatformBadge } from "@/components/ui";
import { ConnectButton, DisconnectButton } from "@/components/integration-buttons";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const ctx = await requireTenant(slug);
  const canManage = roleAtLeast(ctx.role, "ADMIN");

  const accounts = await db.socialAccount.findMany({
    where: { tenantId: ctx.tenant.id, status: { not: "DISCONNECTED" } },
  });
  const byProvider = new Map(accounts.map((a) => [a.provider, a]));
  const platforms = platformStatuses();

  return (
    <main className="px-6 md:px-10 py-8 max-w-3xl">
      <PageHeader
        title="Connected platforms"
        subtitle="Markit posts on your behalf through official connections. We never ask for or store your platform passwords."
      />

      <div className="flex flex-col gap-2.5">
        {platforms.map((p) => {
          const account = byProvider.get(p.id);
          return (
            <Card key={p.id} className="flex items-center gap-4 flex-wrap">
              <PlatformBadge platform={p.id} size={34} />
              <div className="flex-1 min-w-[160px]">
                <div className="font-bold">{p.name}</div>
                <div className="text-[13px] text-ink-soft">
                  {account?.status === "CONNECTED"
                    ? `${account.accountName}${account.lastPublishedAt ? ` · last posted ${formatDateTime(account.lastPublishedAt)}` : " · nothing posted yet"}`
                    : account?.status === "EXPIRED"
                      ? "Connection expired — reconnect to keep posting."
                      : p.available
                        ? "Not connected yet."
                        : "Not available on this deployment yet."}
                </div>
              </div>

              {account?.status === "CONNECTED" ? (
                <div className="flex items-center gap-3">
                  <Pill tone="leaf">Connected</Pill>
                  {canManage && <DisconnectButton slug={slug} accountId={account.id} />}
                </div>
              ) : account?.status === "EXPIRED" ? (
                <div className="flex items-center gap-3">
                  <Pill tone="chili">Needs reconnecting</Pill>
                  {canManage && <ConnectButton slug={slug} provider={p.id} label="Reconnect" available={p.available} />}
                </div>
              ) : p.available ? (
                canManage && <ConnectButton slug={slug} provider={p.id} label="Connect" available />
              ) : (
                <Pill tone="saffron">Coming soon</Pill>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 bg-surface-2 border-dashed">
        <p className="text-[13.5px] text-ink-soft">
          <b className="text-ink">Why some platforms say &ldquo;coming soon&rdquo;:</b> each one needs its
          own approved app and review before it can post on your behalf. Until that&apos;s in place,
          Markit still writes and plans the content — it just can&apos;t publish it for you yet.
        </p>
      </Card>
    </main>
  );
}
