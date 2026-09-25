"use client";

import { useState } from "react";
import { InlineUpload } from "@/components/inline-upload";
import { cn } from "@/lib/utils";

export interface StyleRefChoice {
  id: string;
  filename: string;
}

/**
 * "Make it look like this."
 *
 * The owner points at a design they admire — a poster, a flyer they saved,
 * something from Pinterest — and the flyers are art-directed from it. We take
 * the styling only: never its words, its prices or its branding.
 */
export function StyleReference({
  slug,
  refs,
  selected,
  onChange,
  aiReady,
}: {
  slug: string;
  refs: StyleRefChoice[];
  selected: string | null;
  onChange: (id: string | null) => void;
  /** True when an image model is available to actually paint in that style. */
  aiReady: boolean;
}) {
  const [added, setAdded] = useState<StyleRefChoice[]>([]);
  const all = [...added, ...refs].filter((r, i, a) => a.findIndex((q) => q.id === r.id) === i);

  return (
    <div>
      <input type="hidden" name="styleRefAssetId" value={selected ?? ""} />

      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div className="text-[13px] font-semibold">Design you want it to look like</div>
        {selected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[12px] text-ink-soft hover:text-ink cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-[12px] text-ink-faint mb-3">
        Saw a flyer you love? Add it here and we&apos;ll design yours in that style — your words,
        your price, your photo. We never copy its text or branding.
      </p>

      <div className="flex gap-2 flex-wrap items-start">
        <InlineUpload
          slug={slug}
          accept="image"
          purpose="style-ref"
          label="＋ Add"
          onUploaded={(id) => {
            setAdded((p) => [{ id, filename: "Reference" }, ...p]);
            onChange(id);
          }}
        />
        {all.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id === selected ? null : r.id)}
            aria-pressed={r.id === selected}
            title={r.filename}
            className={cn(
              "w-16 h-16 rounded-[10px] overflow-hidden border-2 cursor-pointer transition-transform hover:-translate-y-px",
              r.id === selected ? "border-beet shadow-lift" : "border-line hover:border-line-strong",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/assets/${r.id}`} alt={r.filename} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {selected && !aiReady && (
        <p className="text-[11.5px] text-saffron-deep bg-saffron-tint rounded-[10px] px-3 py-2 mt-3">
          We&apos;ll take the colours from your reference. Matching its full style — the lighting,
          finish and materials — needs the image model switched on
          (<code className="font-mono">AI_PROVIDER=openai</code> with credit on the account).
        </p>
      )}
    </div>
  );
}
