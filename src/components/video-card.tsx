"use client";

import { useState, useTransition } from "react";
import { watermarkVideoAction, deleteAssetAction } from "@/server/actions/assets";
import { createReelFromVideoAction } from "@/server/actions/marketing";
import { Pill } from "@/components/ui";

export function VideoCard({
  slug,
  canEdit,
  ffmpegReady,
  asset,
}: {
  slug: string;
  canEdit: boolean;
  ffmpegReady: boolean;
  asset: {
    id: string;
    filename: string;
    durationSec: number | null;
    watermarked: boolean;
    hasPoster: boolean;
    tags: string[];
  };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  return (
    <figure className="bg-surface border border-line rounded-[14px] overflow-hidden shadow-soft flex flex-col">
      <div className="aspect-[9/16] bg-surface-2 relative">
        <video
          src={`/api/assets/${asset.id}`}
          poster={asset.hasPoster ? `/api/assets/${asset.id}/poster` : undefined}
          controls
          preload="metadata"
          className="w-full h-full object-cover"
        />
        {asset.durationSec ? (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full tnum pointer-events-none">
            {Math.round(asset.durationSec)}s
          </span>
        ) : null}
      </div>

      <figcaption className="px-3 py-2.5 flex flex-col gap-1.5 flex-1">
        <div className="text-[12.5px] font-semibold truncate" title={asset.filename}>
          {asset.filename}
        </div>

        {asset.watermarked && <Pill tone="leaf">Branded</Pill>}
        {error && <span className="text-[11px] text-chili-deep">{error}</span>}
        {done && <span className="text-[11px] text-leaf-deep">Branded copy added.</span>}

        {canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => createReelFromVideoAction(slug, asset.id))}
            className="text-[12px] font-bold bg-beet text-white rounded-[8px] px-3 py-1.5 cursor-pointer disabled:opacity-50"
          >
            Post as a Reel
          </button>
        )}
        {canEdit && (
          <div className="flex items-center justify-between gap-2 mt-auto pt-1">
            {!asset.watermarked && ffmpegReady && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await watermarkVideoAction(slug, asset.id);
                    setError(result.error);
                    setDone(Boolean(result.ok));
                  })
                }
                className="text-[11px] font-bold text-beet hover:text-beet-deep cursor-pointer disabled:opacity-50"
              >
                {pending ? "Branding…" : "Add my brand mark"}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Delete this video?")) {
                  start(() => deleteAssetAction(slug, asset.id));
                }
              }}
              className="text-[11px] font-bold text-ink-faint hover:text-chili-deep cursor-pointer ml-auto"
            >
              Delete
            </button>
          </div>
        )}
      </figcaption>
    </figure>
  );
}
