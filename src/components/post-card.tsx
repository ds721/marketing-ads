"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { publishNowAction } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { Pill, StatusPill, PlatformBadge, btnStyles, FormError, FormSuccess } from "@/components/ui";
import type { ContentStatus } from "@prisma/client";

/**
 * One post as the owner will see it on Instagram: the picture and the words,
 * with a single button. This is the preview they asked for.
 */
export function PostCard({
  slug,
  canPublish,
  connected,
  item,
}: {
  slug: string;
  canPublish: boolean;
  connected: boolean;
  item: {
    id: string;
    platform: string;
    contentType: string;
    title: string;
    hook: string | null;
    body: string;
    cta: string | null;
    hashtags: string[];
    assetId: string | null;
    status: ContentStatus;
    scheduledAt: string | null;
  };
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const [status, setStatus] = useState(item.status);

  const isStory = item.contentType === "STORY";
  const isLive = status === "PUBLISHED";
  const ready = Boolean(item.assetId) && connected;

  return (
    <article className="bg-surface border border-line rounded-[16px] shadow-soft overflow-hidden grid sm:grid-cols-[200px_1fr]">
      <Link
        href={`/app/${slug}/content/${item.id}`}
        className={`bg-surface-2 flex items-center justify-center ${isStory ? "aspect-[9/16] sm:aspect-auto" : "aspect-square sm:aspect-auto"}`}
        title="Change the photo"
      >
        {item.assetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${item.assetId}`} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[12px] text-ink-faint px-4 text-center">No photo yet — tap to pick one</span>
        )}
      </Link>

      <div className="p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <PlatformBadge platform={item.platform} size={22} />
          <Pill tone={isStory ? "peacock" : "beet"}>{isStory ? "Story" : "Post"}</Pill>
          <StatusPill status={status} />
          {item.scheduledAt && !isLive && (
            <span className="text-[12px] text-ink-faint ml-auto">
              {new Date(item.scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {!isStory && (
          <div className="text-[14px] whitespace-pre-wrap leading-relaxed">
            {item.hook && <p className="font-semibold text-beet-deep mb-1">{item.hook}</p>}
            <p>{item.body}</p>
            {item.cta && <p className="mt-1">{item.cta}</p>}
            {item.hashtags.length > 0 && (
              <p className="text-[13px] text-peacock-deep mt-1">{item.hashtags.join(" ")}</p>
            )}
          </div>
        )}
        {isStory && <p className="text-[13.5px] text-ink-soft">Stories carry the flyer only — no caption.</p>}

        <FormError error={result.error} />
        <FormSuccess message={result.message} />

        <div className="flex items-center gap-3 mt-auto pt-1 flex-wrap">
          {canPublish && !isLive && (
            <button
              type="button"
              disabled={pending || !ready}
              onClick={() =>
                start(async () => {
                  const r = await publishNowAction(slug, item.id);
                  setResult(r);
                  if (r.ok && r.message?.includes("live")) setStatus("PUBLISHED");
                })
              }
              className={btnStyles.primary}
            >
              {pending ? "Posting to Instagram…" : isStory ? "Post story now" : "Post to Instagram now"}
            </button>
          )}
          {isLive && <span className="text-[13.5px] font-semibold text-leaf-deep">Live on Instagram</span>}
          <Link href={`/app/${slug}/content/${item.id}`} className="text-[13px] font-semibold text-ink-soft hover:text-ink">
            Edit
          </Link>
          {!ready && !isLive && (
            <span className="text-[12px] text-ink-faint">
              {!connected ? "Connect Instagram to post" : "Pick a photo to post"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
