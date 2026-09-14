import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { isMediaToolingAvailable } from "@/server/creative/media";
import { PageHeader } from "@/components/page-header";
import { Card, EmptyState, Pill, SectionLabel, StatusPill } from "@/components/ui";
import { VideoScriptForm } from "@/components/video-forms";
import { AssetUploader } from "@/components/asset-forms";
import { VideoCard } from "@/components/video-card";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Videos" };

interface Shot {
  order: number;
  seconds: number;
  visual: string;
  onScreenText: string | null;
}

export default async function VideosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await requireTenant(slug);
  const canEdit = roleAtLeast(ctx.role, "EDITOR");

  const [scripts, videos, ffmpegReady] = await Promise.all([
    db.videoScript.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { contentItem: { select: { id: true, status: true, scheduledAt: true } } },
    }),
    db.asset.findMany({
      where: { tenantId: ctx.tenant.id, kind: "VIDEO" },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    isMediaToolingAvailable(),
  ]);

  return (
    <main className="px-6 md:px-10 py-8 max-w-5xl">
      <PageHeader
        title="Videos & Reels"
        subtitle="Reels are how most people find local businesses now. We plan the video; you film it on your phone in ten minutes."
      />

      {canEdit && (
        <section className="mb-10">
          <SectionLabel>Plan a video</SectionLabel>
          <VideoScriptForm slug={slug} />
        </section>
      )}

      <section className="mb-10">
        <SectionLabel>Your video plans</SectionLabel>
        {scripts.length === 0 ? (
          <EmptyState
            title="No video plans yet"
            body="Tell us what to film — a dish, a treatment, a before-and-after — and you'll get a shot-by-shot plan with the caption written."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {scripts.map((script) => {
              const shots = (script.shots as unknown as Shot[]) ?? [];
              return (
                <Card key={script.id}>
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Pill tone="beet">{script.format}</Pill>
                        <Pill tone="peacock">{script.durationSec}s</Pill>
                        {script.contentItem && <StatusPill status={script.contentItem.status} />}
                      </div>
                      <div className="font-bold">{script.concept}</div>
                    </div>
                    <span className="text-xs text-ink-faint">{formatDate(script.createdAt)}</span>
                  </div>

                  <div className="bg-beet-tint text-beet-deep rounded-[12px] px-4 py-3 mb-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1">
                      First 2 seconds — the hook
                    </div>
                    <div className="font-semibold text-[15px]">{script.hook}</div>
                  </div>

                  <div className="mb-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint mb-2">
                      Shot list
                    </div>
                    <ol className="flex flex-col gap-2">
                      {shots.map((shot) => (
                        <li key={shot.order} className="flex gap-3 text-[14px]">
                          <span className="shrink-0 w-12 text-ink-faint tnum font-semibold">
                            {shot.seconds}s
                          </span>
                          <span className="flex-1">
                            {shot.visual}
                            {shot.onScreenText && (
                              <span className="block text-[12.5px] text-saffron-deep font-semibold mt-0.5">
                                On screen: &ldquo;{shot.onScreenText}&rdquo;
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {script.voiceover && (
                    <div className="mb-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint mb-1">
                        What to say
                      </div>
                      <p className="text-[14px]">{script.voiceover}</p>
                    </div>
                  )}

                  <div className="border-t border-line pt-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint mb-1">
                      Caption
                    </div>
                    <p className="text-[14px] whitespace-pre-wrap">{script.caption}</p>
                    {script.hashtags.length > 0 && (
                      <p className="text-[13px] text-peacock-deep mt-1">{script.hashtags.join(" ")}</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionLabel>Your video library</SectionLabel>
        <p className="text-[13.5px] text-ink-soft mb-3 max-w-[62ch]">
          Upload the videos you already have — old clips, phone footage, anything. We keep them here
          so they can be reused in campaigns, and we can burn your brand mark onto any of them.
        </p>

        {!ffmpegReady && (
          <Card className="mb-4 bg-saffron-tint border-0">
            <p className="text-[13.5px] text-saffron-deep">
              <b>Video branding is unavailable on this server.</b> ffmpeg isn&apos;t installed, so we
              can&apos;t add your logo to videos or make preview thumbnails. Uploads and everything
              else still work.
            </p>
          </Card>
        )}

        {canEdit && <AssetUploader slug={slug} accept="video" />}

        {videos.length === 0 ? (
          <EmptyState
            title="No videos yet"
            body="Upload a few clips you've already filmed — they're often the fastest way to get a Reel out this week."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                slug={slug}
                canEdit={canEdit}
                ffmpegReady={ffmpegReady}
                asset={{
                  id: v.id,
                  filename: v.filename,
                  durationSec: v.durationSec,
                  watermarked: v.watermarked,
                  hasPoster: Boolean(v.posterKey),
                  tags: v.tags,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
