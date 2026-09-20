"use client";

import { useActionState, useState } from "react";
import { changeLookAction } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { LookPicker } from "@/components/look-picker";
import { FormError, FormSuccess, btnStyles } from "@/components/ui";
import type { LookPreview, PhotoChoice } from "@/server/creative/looks";
import { PhotoGenerator } from "@/components/photo-generator";

const initial: FormState = {};

/** Collapsed by default so the preview page stays about the posts. */
export function ChangeLook({
  slug,
  campaignId,
  looks,
  photos,
  currentLook,
  currentPhotoId,
  canGeneratePhotos,
  subject,
}: {
  slug: string;
  campaignId: string;
  looks: LookPreview[];
  photos: PhotoChoice[];
  currentLook: string;
  currentPhotoId: string | null;
  canGeneratePhotos: boolean;
  subject: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(changeLookAction.bind(null, slug, campaignId), initial);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnStyles.ghost + " text-[13px]"}>
        Change the look
      </button>
    );
  }

  return (
    <form action={action} className="bg-surface border border-line rounded-[16px] p-4 flex flex-col gap-4 w-full">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />
      <LookPicker
        slug={slug}
        looks={looks}
        photos={photos}
        defaultLook={currentLook}
        defaultPhotoId={currentPhotoId}
        compact
        generator={canGeneratePhotos ? (onGenerated) => <PhotoGenerator slug={slug} suggestion={subject} onGenerated={onGenerated} /> : undefined}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnStyles.primary}>
          {pending ? "Redrawing…" : "Redraw flyers"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnStyles.ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
