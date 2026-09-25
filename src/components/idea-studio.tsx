"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { submitIdeaAction, stylePaletteAction, type DesignOptionDto } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { FormError, btnStyles } from "@/components/ui";
import { LookPicker } from "@/components/look-picker";
import { DesignPicker } from "@/components/design-picker";
import { PhotoGenerator } from "@/components/photo-generator";
import { StyleReference } from "@/components/style-reference";
import { renderDesign } from "@/server/creative/design-renderer";
import { renderTemplate } from "@/server/creative/templates";
import { cleanText } from "@/server/creative/svg";
import { ensureFonts, fontsReady } from "@/server/creative/fonts";
import type { LookPreview, PhotoChoice, PreviewContext } from "@/server/creative/looks";
import { cn } from "@/lib/utils";

const initial: FormState = {};

/**
 * Quick read of the owner's sentence for the live preview only. The real
 * facts are extracted server-side by the AI when they submit.
 */
export function sketch(text: string): { headline: string; price: string | null; when: string | null } {
  const t = text.trim();
  const price = t.match(/(?:₹|rs\.?\s?|inr\s?)(\d[\d,]*)/i)?.[1] ?? null;
  const lower = t.toLowerCase();
  const sat = /saturday/.test(lower), sun = /sunday/.test(lower);
  const when =
    /today/.test(lower) ? "Today"
    : /tomorrow/.test(lower) ? "Tomorrow"
    : /weekend/.test(lower) || (sat && sun) ? "Saturday & Sunday"
    : sat ? "Saturday" : sun ? "Sunday"
    : lower.match(/\b(monday|tuesday|wednesday|thursday|friday)\b/)?.[1]?.replace(/^\w/, (c) => c.toUpperCase()) ?? null;
  let headline = cleanText(t.split(/[.\n]/)[0] ?? "");
  headline = headline
    .replace(/(?:for\s+)?(?:₹|rs\.?\s?|inr\s?)\d[\d,]*/i, "")
    .replace(/\b(this|on|for)?\s*(weekend|today|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday)(\s+only)?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[-–,]\s*$/, "")
    .trim();
  return { headline: headline || "Your offer here", price: price ? `₹${price}` : null, when };
}

export function IdeaStudio({
  slug,
  looks,
  photos,
  styleRefs,
  defaultLook,
  context,
  canGeneratePhotos,
}: {
  slug: string;
  looks: LookPreview[];
  photos: PhotoChoice[];
  styleRefs: PhotoChoice[];
  defaultLook: string;
  context: PreviewContext;
  canGeneratePhotos: boolean;
}) {
  const [state, action, pending] = useActionState(submitIdeaAction.bind(null, slug), initial);
  const [text, setText] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(photos[0]?.id ?? null);
  const [design, setDesign] = useState<DesignOptionDto | null>(null);
  const [styleRefId, setStyleRefId] = useState<string | null>(null);
  // The reference's colours, read server-side so the preview matches the flyer.
  const [refBrand, setRefBrand] = useState<PreviewContext["brand"] | null>(null);
  const [shape, setShape] = useState<"square" | "story">("square");
  const [fonts, setFonts] = useState(fontsReady());
  useEffect(() => {
    ensureFonts().then(() => setFonts(true));
  }, []);

  const brief = useMemo(() => sketch(text), [text]);

  useEffect(() => {
    if (!styleRefId) {
      setRefBrand(null);
      return;
    }
    let live = true;
    void stylePaletteAction(slug, styleRefId).then((p) => {
      if (live) setRefBrand(p);
    });
    return () => {
      live = false;
    };
  }, [styleRefId, slug]);

  const svg = useMemo(() => {
    void fonts;
    const input = {
      format: shape,
      headline: brief.headline,
      price: brief.price,
      when: brief.when,
      businessName: context.businessName,
      category: context.category,
      cta: context.cta ?? "Order now",
      phone: context.phone,
      address: context.address,
      brand: refBrand ?? context.brand,
      photo: photoId ? `/api/assets/${photoId}` : null,
      watermark: context.watermark ? { ...context.watermark, logoDataUri: null } : null,
    };
    // Before a design is chosen, show the brand's default look so the page
    // isn't empty; once chosen, the preview is the AI's design.
    return design ? renderDesign(design.spec, input) : renderTemplate(defaultLook, input);
  }, [brief, photoId, shape, context, design, defaultLook, fonts, refBrand]);

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
      <form action={action} className="flex flex-col gap-5">
        <FormError error={state.error} />
        <textarea
          name="text"
          rows={3}
          required
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          placeholder="What's happening? e.g. Filter coffee ₹40 all day Sunday"
          className="w-full bg-surface border-[1.5px] border-line-strong rounded-[16px] px-5 py-4 text-[15px] text-ink placeholder:text-ink-faint focus:border-beet focus:outline-none shadow-soft resize-none"
        />

        <div className="bg-surface border border-line rounded-[16px] p-4 flex flex-col gap-5">
          <LookPicker
            slug={slug}
            looks={looks}
            photos={photos}
            defaultLook={defaultLook}
            defaultPhotoId={photoId}
            photoOnly
            onChange={(_l, p) => setPhotoId(p)}
            generator={
              canGeneratePhotos
                ? (onGenerated) => <PhotoGenerator slug={slug} suggestion={brief.headline} onGenerated={onGenerated} />
                : undefined
            }
          />
          {!canGeneratePhotos && (
            <p className="text-[11.5px] text-ink-faint -mt-3">
              Want Markit to make a photo when you don&apos;t have one? That switches on when the
              platform has an OpenAI key (<code className="font-mono">AI_PROVIDER=openai</code>).
            </p>
          )}
          <StyleReference
            slug={slug}
            refs={styleRefs}
            selected={styleRefId}
            onChange={setStyleRefId}
            aiReady={canGeneratePhotos}
          />
          <DesignPicker slug={slug} brief={brief} heroAssetId={photoId} selected={design} onSelect={setDesign} />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-ink-faint max-w-[40ch]">
            The AI writes the caption, locks the price and dates, and draws a post and a story in
            {design ? ` “${design.spec.name}”.` : " your brand's default look — or tap Design it first."}
          </span>
          <button type="submit" disabled={pending} className={btnStyles.idea}>
            {pending ? "Working on it…" : "Make it happen"}
          </button>
        </div>
      </form>

      <aside className="lg:sticky lg:top-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">Preview</span>
          <div className="inline-flex bg-surface-2 rounded-full p-0.5 border border-line">
            {(["square", "story"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShape(s)}
                className={cn(
                  "text-[12px] font-semibold px-3 py-1 rounded-full cursor-pointer",
                  shape === s ? "bg-surface text-ink shadow-soft" : "text-ink-soft",
                )}
              >
                {s === "square" ? "Post" : "Story"}
              </button>
            ))}
          </div>
        </div>
        <div
          className={cn(
            "rounded-[18px] overflow-hidden border border-line shadow-lift bg-surface-2 mx-auto",
            shape === "story" ? "max-w-[270px]" : "max-w-[400px]",
          )}
          // Rendered by our own template code from the owner's words — no third-party markup.
          dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg style="width:100%;height:auto;display:block" ') }}
        />
        <p className="text-[12px] text-ink-faint mt-2 text-center">
          Rough preview — the AI tidies the words and locks the exact price when you submit.
        </p>
      </aside>
    </div>
  );
}
