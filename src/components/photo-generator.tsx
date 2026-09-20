"use client";

import { useState, useTransition } from "react";
import { generatePhotoAction } from "@/server/actions/assets";
import { FormError, btnStyles, inputCls } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * "I don't have a photo" → describe it, get one. Only shown when an image
 * model is configured; otherwise the studio explains what to set instead.
 */
export function PhotoGenerator({
  slug,
  suggestion,
  onGenerated,
}: {
  slug: string;
  suggestion: string;
  onGenerated: (assetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(suggestion);
  const [style, setStyle] = useState<"warm" | "clean" | "moody">("warm");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => { setSubject(suggestion); setOpen(true); }} className="w-16 h-16 rounded-[10px] border-2 border-dashed border-line-strong text-[11px] font-bold text-beet hover:border-beet cursor-pointer leading-tight">
        ✦ Make a photo
      </button>
    );
  }

  return (
    <div className="w-full bg-surface-2 rounded-[12px] p-3 flex flex-col gap-2.5">
      <FormError error={error} />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="filter coffee in a steel tumbler"
        className={inputCls}
        aria-label="What should the photo show?"
      />
      <div className="flex items-center gap-2 flex-wrap">
        {(["warm", "clean", "moody"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStyle(s)}
            className={cn(
              "text-[12px] font-semibold px-3 py-1 rounded-full border cursor-pointer capitalize",
              style === s ? "bg-beet text-white border-beet" : "border-line-strong text-ink-soft",
            )}
          >
            {s}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={() => setOpen(false)} className={btnStyles.ghost + " text-[12px]"}>
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || subject.trim().length < 2}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("subject", subject);
              fd.set("style", style);
              const result = await generatePhotoAction(slug, {}, fd);
              if (result.error) setError(result.error);
              else if (result.assetId) {
                setError(undefined);
                setOpen(false);
                onGenerated(result.assetId);
              }
            })
          }
          className={btnStyles.primary + " text-[12px]"}
        >
          {pending ? "Making it… (~20s)" : "Generate"}
        </button>
      </div>
      <p className="text-[11.5px] text-ink-faint">
        The AI only draws the scene. Your price, dates and phone number are placed by Markit afterwards, so they can&apos;t come out wrong.
      </p>
    </div>
  );
}
