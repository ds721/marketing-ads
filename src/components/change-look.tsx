"use client";

import { useActionState, useState } from "react";
import { changeLookAction, type DesignOptionDto } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { LookPicker } from "@/components/look-picker";
import { DesignPicker } from "@/components/design-picker";
import { PhotoGenerator } from "@/components/photo-generator";
import { FormError, FormSuccess, btnStyles } from "@/components/ui";
import type { LookPreview, PhotoChoice } from "@/server/creative/looks";

const initial: FormState = {};

/** Redesign an existing campaign's flyers: new photo and/or a fresh AI direction. */
export function ChangeLook({
  slug,
  campaignId,
  looks,
  photos,
  currentLook,
  currentPhotoId,
  canGeneratePhotos,
  subject,
  brief,
}: {
  slug: string;
  campaignId: string;
  looks: LookPreview[];
  photos: PhotoChoice[];
  currentLook: string;
  currentPhotoId: string | null;
  canGeneratePhotos: boolean;
  subject: string;
  brief: { headline: string; price: string | null; when: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [photoId, setPhotoId] = useState(currentPhotoId);
  const [design, setDesign] = useState<DesignOptionDto | null>(null);
  const [state, action, pending] = useActionState(changeLookAction.bind(null, slug, campaignId), initial);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnStyles.ghost + " text-[13px]"}>
        ✦ Redesign
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
        photoOnly
        onChange={(_l, p) => setPhotoId(p)}
        generator={canGeneratePhotos ? (onGenerated) => <PhotoGenerator slug={slug} suggestion={subject} onGenerated={onGenerated} /> : undefined}
      />
      <DesignPicker slug={slug} brief={brief} heroAssetId={photoId} selected={design} onSelect={setDesign} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !design} className={btnStyles.primary}>
          {pending ? "Redrawing…" : "Use this design"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnStyles.ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
