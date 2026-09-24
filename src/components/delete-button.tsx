"use client";

import { useState, useTransition } from "react";
import { deleteContentAction, deleteCampaignAction } from "@/server/actions/marketing";
import { btnStyles } from "@/components/ui";

// Deleting is one of the few things in the app the owner can't undo, so it
// takes two clicks and states plainly what will and won't disappear.

function Confirm({
  label,
  question,
  note,
  onConfirm,
}: {
  label: string;
  question: string;
  note?: string;
  onConfirm: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={btnStyles.ghost}>
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-[12px] border border-chili/40 bg-chili-tint/50 p-3 flex flex-col gap-2">
      <p className="text-[13.5px] font-semibold text-chili-deep">{question}</p>
      {note && <p className="text-[12.5px] text-ink-soft">{note}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => onConfirm())}
          className={btnStyles.danger}
        >
          {pending ? "Removing…" : "Yes, remove"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setArmed(false)}
          className={btnStyles.ghost}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}

export function DeletePost({
  slug,
  contentId,
  published,
}: {
  slug: string;
  contentId: string;
  published: boolean;
}) {
  return (
    <Confirm
      label="Remove this post"
      question="Remove this post from Markit?"
      note={
        published
          ? "It stays on your Instagram — Instagram doesn't let apps delete posts, so you'd need to remove it there too. This clears it from your calendar and reporting."
          : "The caption and schedule go. Your photos and flyers stay in your library."
      }
      onConfirm={async () => {
        await deleteContentAction(slug, contentId);
      }}
    />
  );
}

export function DeleteCampaign({
  slug,
  campaignId,
  postCount,
  publishedCount,
}: {
  slug: string;
  campaignId: string;
  postCount: number;
  publishedCount: number;
}) {
  const pieces = postCount === 1 ? "1 post" : `${postCount} posts`;
  return (
    <Confirm
      label="Delete campaign"
      question={`Delete this campaign and its ${pieces}?`}
      note={
        publishedCount > 0
          ? `${publishedCount === 1 ? "One post is" : `${publishedCount} posts are`} already live on Instagram and will stay there — Instagram doesn't let apps delete posts. Everything else is cleared from Markit. Your photos and flyers stay in your library.`
          : "Your photos and flyers stay in your library."
      }
      onConfirm={async () => {
        await deleteCampaignAction(slug, campaignId);
      }}
    />
  );
}
