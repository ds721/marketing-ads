"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LookPreview, PhotoChoice } from "@/server/creative/looks";
import { InlineUpload } from "@/components/inline-upload";

/**
 * The owner picks how the flyer should look — and which photo to use —
 * before anything is generated. Renders as plain form fields so it slots
 * into any server-action form.
 */
export function LookPicker({
  looks,
  photos,
  defaultLook,
  defaultPhotoId = null,
  compact = false,
  onChange,
  generator,
  slug,
  photoOnly = false,
}: {
  looks: LookPreview[];
  photos: PhotoChoice[];
  defaultLook: string;
  defaultPhotoId?: string | null;
  compact?: boolean;
  onChange?: (look: string, photoId: string | null) => void;
  /** Optional "make a photo" control, rendered inside the photo row. */
  generator?: (onGenerated: (assetId: string) => void) => React.ReactNode;
  /** Tenant slug — enables the inline upload tile. */
  slug?: string;
  /** Hide the fixed looks; the AI designs instead. */
  photoOnly?: boolean;
}) {
  const [look, setLookState] = useState(defaultLook);
  const [photoId, setPhotoIdState] = useState<string | null>(defaultPhotoId);
  const [extra, setExtra] = useState<PhotoChoice[]>([]);
  // A just-added photo appears locally at once, and again from the server
  // after revalidation — keep one copy.
  const allPhotos = [...extra, ...photos].filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i);
  const setLook = (l: string) => { setLookState(l); onChange?.(l, photoId); };
  const setPhotoId = (p: string | null) => { setPhotoIdState(p); onChange?.(look, p); };
  const chosen = looks.find((l) => l.id === look);

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="template" value={look} />
      <input type="hidden" name="heroAssetId" value={photoId ?? ""} />

      {!photoOnly && (
      <div>
        <div className="text-[13px] font-semibold mb-2">Look</div>
        <div className={cn("grid gap-2", compact ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-6")}>
          {looks.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLook(l.id)}
              aria-pressed={l.id === look}
              title={l.blurb}
              className={cn(
                "rounded-[12px] overflow-hidden border-2 bg-surface-2 text-left cursor-pointer transition-transform hover:-translate-y-px",
                l.id === look ? "border-beet shadow-lift" : "border-line hover:border-line-strong",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.preview} alt={l.name} className="w-full aspect-square object-cover" />
              <div className="px-2 py-1.5 text-[11.5px] font-bold">{l.name}</div>
            </button>
          ))}
        </div>
        {chosen && <p className="text-[12.5px] text-ink-soft mt-2">{chosen.blurb}</p>}
      </div>
      )}

      <div>
        <div className="text-[13px] font-semibold mb-2">
          Photo{" "}
          <span className="font-normal text-ink-faint">
            {photoOnly ? "— your own, or made by AI" : chosen?.wantsPhoto ? "— this look works best with one" : "— optional"}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
            {slug && (
              <InlineUpload
                slug={slug}
                accept="image"
                onUploaded={(assetId) => {
                  setExtra((e) => [{ id: assetId, filename: "Uploaded photo" }, ...e]);
                  setPhotoId(assetId);
                }}
              />
            )}
            {generator?.((assetId) => {
              setExtra((e) => [{ id: assetId, filename: "AI photo" }, ...e]);
              setPhotoId(assetId);
            })}
            <button
              type="button"
              onClick={() => setPhotoId(null)}
              aria-pressed={photoId === null}
              className={cn(
                "w-16 h-16 rounded-[10px] border-2 text-[11px] font-bold text-ink-soft cursor-pointer",
                photoId === null ? "border-beet bg-beet-tint text-beet-deep" : "border-line bg-surface-2",
              )}
            >
              None
            </button>
            {allPhotos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPhotoId(p.id)}
                aria-pressed={photoId === p.id}
                title={p.filename}
                className={cn(
                  "w-16 h-16 rounded-[10px] overflow-hidden border-2 cursor-pointer",
                  photoId === p.id ? "border-beet shadow-lift" : "border-line hover:border-line-strong",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/assets/${p.id}`} alt={p.filename} className="w-full h-full object-cover" />
              </button>
            ))}
        </div>
        {allPhotos.length === 0 && (
          <p className="text-[12px] text-ink-faint mt-2">
            A photo of the dish, the product or your shopfront makes every look better.
          </p>
        )}
      </div>
    </div>
  );
}
