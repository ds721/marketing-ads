"use client";

import { useState, useTransition } from "react";
import { designIdeasAction, type DesignOptionDto } from "@/server/actions/marketing";
import { FormError, btnStyles } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * "Design it": the AI proposes several distinct directions for this exact
 * offer, rendered in the business's colours with its photo. The owner picks
 * one; the choice travels as a validated spec, never as markup.
 */
export function DesignPicker({
  slug,
  brief,
  heroAssetId,
  selected,
  onSelect,
}: {
  slug: string;
  brief: { headline: string; price: string | null; when: string | null };
  heroAssetId: string | null;
  selected: DesignOptionDto | null;
  onSelect: (d: DesignOptionDto) => void;
}) {
  const [options, setOptions] = useState<DesignOptionDto[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const design = () =>
    start(async () => {
      const r = await designIdeasAction(slug, { ...brief, heroAssetId });
      if (r.error) setError(r.error);
      else if (r.designs) {
        setError(undefined);
        setOptions(r.designs);
        if (r.designs[0]) onSelect(r.designs[0]);
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="designSpec" value={selected ? JSON.stringify(selected.spec) : ""} />
      <FormError error={error} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[13px] font-semibold">Design</div>
          <div className="text-[12px] text-ink-faint">
            {options.length === 0
              ? "The AI designs the flyer for this offer — colours, layout, type. You pick."
              : `${options.length} directions. Tap one, or ask for more.`}
          </div>
        </div>
        <button
          type="button"
          onClick={design}
          disabled={pending || brief.headline.trim().length < 2}
          className={options.length ? btnStyles.secondary : btnStyles.primary}
        >
          {pending ? "Designing…" : options.length ? "✦ Design again" : "✦ Design it"}
        </button>
      </div>

      {options.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {options.map((o, i) => {
            const isSel = selected?.spec.name === o.spec.name && selected?.preview === o.preview;
            return (
              <button
                key={`${o.spec.name}-${i}`}
                type="button"
                onClick={() => onSelect(o)}
                aria-pressed={isSel}
                title={o.spec.mood}
                className={cn(
                  "rounded-[12px] overflow-hidden border-2 bg-surface-2 text-left cursor-pointer transition-transform hover:-translate-y-px",
                  isSel ? "border-beet shadow-lift" : "border-line hover:border-line-strong",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.preview} alt={o.spec.name} className="w-full aspect-square object-cover" />
                <div className="px-2 py-1.5">
                  <div className="text-[12px] font-bold truncate">{o.spec.name}</div>
                  <div className="text-[11px] text-ink-faint truncate">{o.spec.mood.replace(/^\[Demo AI\]\s*/, "")}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
