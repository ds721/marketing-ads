import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { platformStatuses } from "@/server/social";
import { PageHeader } from "@/components/page-header";
import { Card, Pill, PlatformBadge, FormError, FormSuccess, btnStyles } from "@/components/ui";
import { DisconnectButton } from "@/components/integration-buttons";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Integrations" };

// Every way the connect flow can end, in the owner's words (§49).
const ERRORS: Record<string, string> = {
  denied: "You cancelled on Facebook, so nothing was connected. Try again whenever you're ready.",
  no_pages:
    "Facebook didn't give us any Pages you manage. Instagram publishing needs a Facebook Page you're an admin of.",
  no_instagram:
    "We connected your Facebook Page, but no Instagram account is linked to it. In the Instagram app: Settings → Account type → switch to Business, then link it to your Page.",
  exchange: "Facebook didn't complete the connection. Try again in a moment.",
  not_configured:
    "This platform isn't available on this deployment yet — it needs an approved Meta app. Ask your administrator.",
  limit: "You've connected all the accounts your plan allows. Upgrade to add more.",
  no_access: "Only an admin of this business can connect platforms.",
  unsupported: "That platform can't be connected yet.",
};

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { tenant: slug } = await params;
  const { error, connected } = await searchParams;
  const ctx = await requireTenant(slug);
  const canManage = roleAtLeast(ctx.role, "ADMIN");
  // Platform operators get told exactly what to configure; owners get told
  // who to ask. Neither should see "coming soon" for a platform that's built.
  const viewer = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { isPlatformAdmin: true },
  });
  const isOperator = viewer?.isPlatformAdmin ?? false;

  const accounts = await db.socialAccount.findMany({
    where: { tenantId: ctx.tenant.id, status: { not: "DISCONNECTED" } },
    orderBy: { createdAt: "asc" },
  });
  const byProvider = new Map<string, typeof accounts>();
  for (const a of accounts) byProvider.set(a.provider, [...(byProvider.get(a.provider) ?? []), a]);
  const platforms = platformStatuses();

  return (
    <main className="px-6 md:px-10 py-8 max-w-3xl">
      <PageHeader
        title="Connected platforms"
        subtitle="Markit posts on your behalf through official connections. We never ask for or store your platform passwords."
      />

      <div className="flex flex-col gap-3 mb-6">
        {error && <FormError error={ERRORS[error] ?? "Something went wrong connecting that platform."} />}
        {connected && (
          <FormSuccess
            message={`Connected ${connected} ${Number(connected) === 1 ? "account" : "accounts"}. Scheduled posts can go out now.`}
          />
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {platforms.map((p) => {
          const list = byProvider.get(p.id) ?? [];
          const live = list.filter((a) => a.status === "CONNECTED");
          const expired = list.filter((a) => a.status === "EXPIRED");
          const isMeta = p.id === "instagram" || p.id === "facebook";
          const connectHref = `/api/social/${p.id}/start?tenant=${encodeURIComponent(slug)}`;

          return (
            <Card key={p.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                <PlatformBadge platform={p.id} size={34} />
                <div className="flex-1 min-w-[160px]">
                  <div className="font-bold">{p.name}</div>
                  <div className="text-[13px] text-ink-soft">
                    {live.length > 0
                      ? `${live.map((a) => a.accountName).join(", ")}${
                          live[0]?.lastPublishedAt
                            ? ` · last posted ${formatDateTime(live[0].lastPublishedAt)}`
                            : " · nothing posted yet"
                        }`
                      : expired.length > 0
                        ? "Connection expired — reconnect to keep posting."
                        : p.available
                          ? "Not connected yet."
                          : p.supported
                            ? "Built and ready — needs the Meta app set up on this server."
                            : "Not available yet."}
                  </div>
                </div>

                {live.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <Pill tone="leaf">Connected</Pill>
                    {canManage && live[0] && <DisconnectButton slug={slug} accountId={live[0].id} />}
                  </div>
                ) : expired.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <Pill tone="chili">Needs reconnecting</Pill>
                    {canManage && p.available && (
                      <a href={connectHref} className={btnStyles.primary}>Reconnect</a>
                    )}
                  </div>
                ) : p.available ? (
                  canManage && (
                    <a href={connectHref} className={btnStyles.primary}>
                      Connect
                    </a>
                  )
                ) : p.supported ? (
                  <Pill tone="chili">Needs setup</Pill>
                ) : (
                  <Pill tone="saffron">Coming soon</Pill>
                )}
              </div>

              {p.supported && !p.available && (
                <p className="text-[12.5px] bg-chili-tint text-chili-deep rounded-[10px] px-3.5 py-2.5">
                  {isOperator ? (
                    <>
                      <b>You&apos;re the platform operator:</b> set{" "}
                      {p.requiredEnv.map((k, i) => (
                        <span key={k}>
                          <code className="font-mono">{k}</code>
                          {i < p.requiredEnv.length - 1 ? " and " : ""}
                        </span>
                      ))}{" "}
                      in the server&apos;s environment, then restart. The README section
                      &ldquo;Connecting Instagram&rdquo; walks through creating the Meta app.
                    </>
                  ) : (
                    <>
                      This platform is built and works — your Markit administrator hasn&apos;t
                      finished connecting it to {p.name} yet. Ask them to enable it.
                    </>
                  )}
                </p>
              )}

              {isMeta && live.length === 0 && p.available && (
                <p className="text-[12.5px] text-ink-soft bg-surface-2 rounded-[10px] px-3.5 py-2.5">
                  {p.id === "instagram" ? (
                    <>
                      <b className="text-ink">Before you connect:</b> your Instagram must be a{" "}
                      <b className="text-ink">Business or Creator</b> account, linked to a Facebook
                      Page you manage. Personal accounts can&apos;t be posted to by any app — that&apos;s
                      an Instagram rule.
                    </>
                  ) : (
                    <>
                      <b className="text-ink">Before you connect:</b> you need to be an admin of the
                      Facebook Page. Connecting Facebook also connects any Instagram account linked to
                      that Page.
                    </>
                  )}
                </p>
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
