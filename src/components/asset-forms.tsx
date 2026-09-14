"use client";

import { useActionState, useTransition, useRef } from "react";
import { uploadAssetAction, deleteAssetAction } from "@/server/actions/assets";
import type { FormState } from "@/server/actions/auth";
import { FormError, FormSuccess, btnStyles } from "@/components/ui";

const initial: FormState = {};

const ACCEPT = {
  all: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime",
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/quicktime",
} as const;

const HINT = {
  all: "JPG, PNG, WEBP, GIF or MP4 · up to 8 MB.",
  image: "JPG, PNG, WEBP or GIF · up to 8 MB.",
  video: "MP4 or MOV · up to 8 MB. Longer clips: trim them on your phone first.",
} as const;

export function AssetUploader({
  slug,
  accept = "all",
}: {
  slug: string;
  accept?: keyof typeof ACCEPT;
}) {
  const [state, action, pending] = useActionState(uploadAssetAction.bind(null, slug), initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-3 bg-surface-2 rounded-[16px] p-4"
    >
      <FormError error={state.error} />
      <FormSuccess message={state.message} />
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="file"
          name="file"
          required
          accept={ACCEPT[accept]}
          className="text-sm file:mr-3 file:rounded-[10px] file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink file:cursor-pointer"
        />
        <button type="submit" disabled={pending} className={btnStyles.tonal}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      <span className="text-xs text-ink-faint">{HINT[accept]}</span>
    </form>
  );
}

export function DeleteAssetButton({ slug, assetId }: { slug: string; assetId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this file? It will be removed from any post using it.")) {
          start(() => deleteAssetAction(slug, assetId));
        }
      }}
      className="text-[11px] font-bold text-ink-faint hover:text-chili-deep cursor-pointer"
    >
      Delete
    </button>
  );
}
