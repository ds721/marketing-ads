import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { platformStatuses } from "@/server/social";
import { PageHeader } from "@/components/page-header";
import { Card, Pill, PlatformBadge, FormError, FormSuccess, btnStyles, SectionLabel } from "@/components/ui";
import { DisconnectButton } from "@/components/integration-buttons";
import { formatDateTime, formatDate } from "@/lib/utils";

export const metadata = { title: "Instagram" };

// Every way the connect flow can end, in the owner's words (§49).
const ERRORS: Record<string, string> = {
  denied: "You cancelled on Instagram, so nothing was connected. Try again whenever you're ready.",
  personal_account:
    "That's a Personal Instagram account, and Instagram doesn't let any app post to those. Switch it to a Business or Creator account (free, 30 seconds) and connect again.",
  exchange: "Instagram didn't complete the connection. Try again in a moment.",
  not_configured:
    "Instagram isn't enabled on this deployment yet. Your administrator needs to finish setting it up.",
  limit: "You've connected all the accounts your plan allows. Upgrade to add more.",
  no_access: "Only an admin of this business can connect Instagram.",
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

  const [accounts, viewer] = await Promise.all([
    db.socialAccount.findMany({
      where: { tenantId: ctx.tenant.id, provider: "instagram", status: { not: "DISCONNECTED" } },
      orderBy: { createdAt: "asc" },
    }),
    db.user.findUnique({ where: { id: ctx.userId }, select: { isPlatformAdmin: true } }),
  ]);
  const isOperator = viewer?.isPlatformAdmin ?? false;

  const instagram = platformStatuses().find((p) => p.id === "instagram")!;
  const later = platformStatuses().filter((p) => p.id !== "instagram");
  const live = accounts.filter((a) => a.status === "CONNECTED");
  const expired = accounts.filter((a) => a.status === "EXPIRED");
  const connectHref = `/api/social/instagram/start?tenant=${encodeURIComponent(slug)}`;

  return (
    <main className="px-6 md:px-10 py-8 max-w-3xl">
      <PageHeader
        title="Instagram"
        subtitle="Connect once and Markit posts for you. You log in on Instagram itself — we never see or store your password."
      />

      <div className="flex flex-col gap-3 mb-6">
        {error && <FormError error={ERRORS[error] ?? "Something went wrong connecting Instagram."} />}
        {connected && (
          <FormSuccess message="Instagram connected. Approved posts will go out on schedule from now on." />
        )}
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <PlatformBadge platform="instagram" size={44} />
          <div className="flex-1 min-w-[200px]">
            <div className="font-bold text-lg">Instagram</div>
            <div className="text-[13.5px] text-ink-soft">
              {live.length > 0
                ? `${live.map((a) => a.accountName).join(", ")}${
                    live[0]?.lastPublishedAt
                      ? ` · last posted ${formatDateTime(live[0].lastPublishedAt)}`
                      : " · nothing posted yet"
                  }`
                : expired.length > 0
                  ? `${expired[0]?.accountName} — connection expired.`
                  : instagram.available
                    ? "Not connected yet."
                    : "Not enabled on this server yet."}
            </div>
            {live[0]?.expiresAt && (
              <div className="text-[12px] text-ink-faint mt-0.5">
                Renews automatically · valid until {formatDate(live[0].expiresAt)}
              </div>
            )}
          </div>

          {live.length > 0 ? (
            <div className="flex items-center gap-3">
              <Pill tone="leaf">Connected</Pill>
              {canManage && live[0] && <DisconnectButton slug={slug} accountId={live[0].id} />}
            </div>
          ) : expired.length > 0 ? (
            <div className="flex items-center gap-3">
              <Pill tone="chili">Needs reconnecting</Pill>
              {canManage && instagram.available && (
                <a href={connectHref} className={btnStyles.primary}>Reconnect</a>
              )}
            </div>
          ) : instagram.available ? (
            canManage && (
              <a href={connectHref} className={btnStyles.primary + " px-6 py-3 text-[15px]"}>
                Connect Instagram
              </a>
            )
          ) : (
            <Pill tone="chili">Needs setup</Pill>
          )}
        </div>

        {live.length === 0 && instagram.available && (
          <div className="bg-surface-2 rounded-[12px] px-4 py-3.5 text-[13.5px]">
            <div className="font-bold mb-1.5">One thing to check first</div>
            <p className="text-ink-soft">
              Your Instagram needs to be a <b className="text-ink">Business</b> or{" "}
              <b className="text-ink">Creator</b> account — Instagram only lets apps post to those.
              It&apos;s free and takes 30 seconds: in the Instagram app, go to{" "}
              <b className="text-ink">Settings → Account type and tools → Switch to professional account</b>.
              No Facebook Page needed.
            </p>
          </div>
        )}

        {!instagram.available && (
          <p className="text-[12.5px] bg-chili-tint text-chili-deep rounded-[10px] px-3.5 py-2.5">
            {isOperator ? (
              <>
                <b>You&apos;re the platform operator:</b> set{" "}
                <code className="font-mono">INSTAGRAM_APP_ID</code> and{" "}
                <code className="font-mono">INSTAGRAM_APP_SECRET</code> in the server&apos;s
                environment, then restart. The README section &ldquo;Connecting Instagram&rdquo;
                walks through creating the app.
              </>
            ) : (
              <>
                Instagram is built and works — your Markit administrator hasn&apos;t finished
                enabling it yet. Ask them to switch it on.
              </>
            )}
          </p>
        )}
      </Card>

      <section className="mt-10">
        <SectionLabel>Later</SectionLabel>
        <div className="flex flex-col gap-2">
          {later.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 rounded-[12px] border border-line bg-surface opacity-70"
            >
              <PlatformBadge platform={p.id} size={26} />
              <span className="font-semibold text-sm flex-1">{p.name}</span>
              <Pill tone="neutral">Coming later</Pill>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-faint mt-3 max-w-[60ch]">
          We&apos;re getting Instagram right first. Markit still writes and plans content for these
          — you just post it yourself for now.
        </p>
      </section>
    </main>
  );
}
