import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { Card, StatusPill, PlatformBadge, SectionLabel, btnStyles } from "@/components/ui";
import { PostEditor, ImagePicker, PublishNow } from "@/components/post-forms";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Post" };

export default async function ContentPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const ctx = await requireTenant(slug);
  const canEdit = roleAtLeast(ctx.role, "EDITOR");

  const item = await db.contentItem.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: { campaign: { select: { id: true, name: true } } },
  });
  if (!item) notFound();

  const [images, attached, connected] = await Promise.all([
    db.asset.findMany({
      where: { tenantId: ctx.tenant.id, kind: { in: ["IMAGE", "FLYER", "GENERATED"] }, sourceAssetId: null },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
    item.assetId ? db.asset.findFirst({ where: { id: item.assetId, tenantId: ctx.tenant.id } }) : null,
    db.socialAccount.findFirst({ where: { tenantId: ctx.tenant.id, provider: item.platform, status: "CONNECTED" } }),
  ]);

  const caption = [item.hook, item.body, item.cta, item.hashtags.join(" ")].filter(Boolean).join("\n\n");
  const isLive = item.status === "PUBLISHED";

  return (
    <main className="px-6 md:px-10 py-8 max-w-4xl">
      <Link href={`/app/${slug}/calendar`} className="text-sm text-ink-soft hover:text-ink">
        ← Calendar
      </Link>
      <PageHeader
        title={item.title}
        subtitle={item.campaign ? `Part of “${item.campaign.name}”` : undefined}
        action={<StatusPill status={item.status} />}
      />

      <div className="grid md:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="flex flex-col gap-6">
          <section>
            <SectionLabel>Caption</SectionLabel>
            {canEdit && !isLive ? (
              <PostEditor slug={slug} contentId={item.id} title={item.title} body={item.body} />
            ) : (
              <Card>
                <p className="text-[14.5px] whitespace-pre-wrap">{caption}</p>
              </Card>
            )}
          </section>

          <section>
            <SectionLabel>Photo</SectionLabel>
            <p className="text-[13px] text-ink-soft mb-3">
              Instagram needs one. Pick a photo you&apos;ve uploaded, or a flyer Markit made.
            </p>
            {canEdit && !isLive ? (
              <ImagePicker
                slug={slug}
                contentId={item.id}
                selectedId={item.assetId}
                images={images.map((a) => ({ id: a.id, filename: a.filename, kind: a.kind }))}
              />
            ) : attached ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${attached.id}`} alt={attached.filename} className="w-56 rounded-[12px] border border-line" />
            ) : (
              <p className="text-sm text-ink-faint">No photo attached.</p>
            )}
            {images.length === 0 && (
              <p className="text-[13px] text-ink-soft mt-3">
                Nothing in your library yet —{" "}
                <Link href={`/app/${slug}/assets`} className="text-beet font-semibold">upload a photo</Link>
                {item.campaign && (
                  <>
                    {" "}or{" "}
                    <Link href={`/app/${slug}/campaigns/${item.campaign.id}`} className="text-beet font-semibold">
                      make the campaign flyer
                    </Link>
                  </>
                )}
                .
              </p>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center gap-3 mb-3">
              <PlatformBadge platform={item.platform} size={30} />
              <div>
                <div className="font-bold text-sm capitalize">{item.platform.replace("_", " ")}</div>
                <div className="text-[12.5px] text-ink-soft">
                  {connected ? connected.accountName : "Not connected"}
                </div>
              </div>
            </div>
            <div className="text-[12.5px] text-ink-soft mb-4">
              {isLive
                ? `Published ${formatDateTime(item.publishedAt)}`
                : item.scheduledAt
                  ? `Scheduled for ${formatDateTime(item.scheduledAt)}`
                  : "Not scheduled"}
            </div>
            {item.failureReason && item.status === "FAILED" && (
              <p className="text-[13px] bg-chili-tint text-chili-deep rounded-[10px] px-3 py-2 mb-4">
                {item.failureReason}
              </p>
            )}
            {canEdit && !isLive && (
              <PublishNow
                slug={slug}
                contentId={item.id}
                ready={Boolean(item.assetId && connected)}
                reason={
                  !connected
                    ? "Connect Instagram first"
                    : !item.assetId
                      ? "Pick a photo first"
                      : undefined
                }
              />
            )}
            {isLive && (
              <p className="text-[13.5px] text-leaf-deep font-semibold">Live on Instagram.</p>
            )}
          </Card>
          {!connected && (
            <Link href={`/app/${slug}/integrations`} className={btnStyles.secondary}>
              Connect Instagram
            </Link>
          )}
        </aside>
      </div>
    </main>
  );
}
