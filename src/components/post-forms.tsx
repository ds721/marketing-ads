"use client";

import { useActionState, useState, useTransition } from "react";
import { updateContentAction, attachAssetAction, publishNowAction } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { Field, FormError, FormSuccess, inputCls, btnStyles, Pill } from "@/components/ui";
import { cn } from "@/lib/utils";

const initial: FormState = {};

export function PostEditor({
  slug,
  contentId,
  title,
  body,
}: {
  slug: string;
  contentId: string;
  title: string;
  body: string;
}) {
  const [state, action, pending] = useActionState(
    updateContentAction.bind(null, slug, contentId),
    initial,
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />
      <Field label="Title" htmlFor="title">
        <input id="title" name="title" defaultValue={title} required className={inputCls} />
      </Field>
      <Field label="Caption" htmlFor="body">
        <textarea id="body" name="body" defaultValue={body} rows={6} required className={inputCls} />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.secondary + " self-start"}>
        {pending ? "Saving…" : "Save caption"}
      </button>
    </form>
  );
}

export function ImagePicker({
  slug,
  contentId,
  selectedId,
  images,
}: {
  slug: string;
  contentId: string;
  selectedId: string | null;
  images: Array<{ id: string; filename: string; kind: string; poster?: string | null }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState(selectedId);

  const choose = (id: string | null) =>
    start(async () => {
      const result = await attachAssetAction(slug, contentId, id);
      if (result.error) setError(result.error);
      else {
        setError(undefined);
        setSelected(id);
      }
    });

  if (images.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <FormError error={error} />
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            disabled={pending}
            onClick={() => choose(img.id === selected ? null : img.id)}
            className={cn(
              "relative aspect-square rounded-[12px] overflow-hidden border-2 bg-surface-2 cursor-pointer",
              img.id === selected ? "border-beet" : "border-line hover:border-line-strong",
            )}
            aria-pressed={img.id === selected}
          >
            {img.kind === "VIDEO" ? (
              img.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.poster} alt={img.filename} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-ink-soft">Video</span>
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${img.id}`} alt={img.filename} className="w-full h-full object-cover" loading="lazy" />
            )}
            {img.kind === "FLYER" && (
              <span className="absolute top-1.5 left-1.5">
                <Pill tone="beet">Flyer</Pill>
              </span>
            )}
            {img.kind === "VIDEO" && (
              <span className="absolute top-1.5 left-1.5">
                <Pill tone="chili">▶ Reel</Pill>
              </span>
            )}
            {img.id === selected && (
              <span className="absolute inset-0 bg-beet/15 flex items-end justify-end p-1.5">
                <span className="bg-beet text-white text-[11px] font-bold px-2 py-0.5 rounded-full">Selected</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PublishNow({
  slug,
  contentId,
  ready,
  reason,
  label,
}: {
  slug: string;
  contentId: string;
  ready: boolean;
  reason?: string;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FormState>({});

  return (
    <div className="flex flex-col gap-2">
      <FormError error={result.error} />
      <FormSuccess message={result.message} />
      <button
        type="button"
        disabled={pending || !ready}
        onClick={() => start(async () => setResult(await publishNowAction(slug, contentId)))}
        className={btnStyles.primary + " w-full"}
      >
        {pending ? "Posting to Instagram…" : (label ?? "Publish now")}
      </button>
      {!ready && reason && <span className="text-[12px] text-ink-faint text-center">{reason}</span>}
    </div>
  );
}
