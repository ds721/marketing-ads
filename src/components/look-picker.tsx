"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LookPreview, PhotoChoice } from "@/server/creative/looks";

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
}: {
  looks: LookPreview[];
  photos: PhotoChoice[];
  defaultLook: string;
  defaultPhotoId?: string | null;
  compact?: boolean;
}) {
  const [look, setLook] = useState(defaultLook);
  const [photoId, setPhotoId] = useState<string | null>(defaultPhotoId);
  const chosen = looks.find((l) => l.id === look);

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="template" value={look} />
      <input type="hidden" name="heroAssetId" value={photoId ?? ""} />

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

      <div>
        <div className="text-[13px] font-semibold mb-2">
          Photo{" "}
          <span className="font-normal text-ink-faint">
            {chosen?.wantsPhoto ? "— this look works best with one" : "— optional"}
          </span>
        </div>
        {photos.length === 0 ? (
          <p className="text-[12.5px] text-ink-soft">
            No photos in your library yet. Upload one under Assets — a shot of the dish, the
            product, your shopfront — and it&apos;ll appear here.
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
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
            {photos.map((p) => (
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
        )}
      </div>
    </div>
  );
}
