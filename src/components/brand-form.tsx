"use client";

import { useActionState } from "react";
import { saveBrandAction } from "@/server/actions/business";
import type { FormState } from "@/server/actions/auth";
import { Field, FormError, FormSuccess, inputCls, btnStyles } from "@/components/ui";

const initial: FormState = {};

const TONES = [
  "Friendly & local",
  "Premium & elegant",
  "Energetic & fun",
  "Trustworthy & educational",
  "Warm & family-like",
];

export function BrandForm({
  slug,
  defaults,
}: {
  slug: string;
  defaults: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    toneOfVoice: string;
    brandDescription: string;
    wordsToUse: string;
    wordsToAvoid: string;
    ctaPreference: string;
    watermarkEnabled: boolean;
    watermarkText: string;
    watermarkPosition: string;
    watermarkOpacity: number;
  };
}) {
  const [state, action, pending] = useActionState(saveBrandAction.bind(null, slug), initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["primaryColor", "Primary colour", defaults.primaryColor],
            ["secondaryColor", "Secondary", defaults.secondaryColor],
            ["accentColor", "Accent", defaults.accentColor],
          ] as const
        ).map(([name, label, value]) => (
          <Field key={name} label={label} htmlFor={name}>
            <input
              id={name}
              name={name}
              type="color"
              defaultValue={value}
              className="w-full h-11 rounded-[10px] border-[1.5px] border-line-strong bg-bg cursor-pointer"
            />
          </Field>
        ))}
      </div>

      <Field label="Tone of voice" htmlFor="toneOfVoice">
        <select id="toneOfVoice" name="toneOfVoice" defaultValue={defaults.toneOfVoice} className={inputCls}>
          <option value="">Let the AI match my business type</option>
          {TONES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>

      <Field
        label="Describe your brand (optional)"
        htmlFor="brandDescription"
        hint='E.g. "Elegant, premium salon for women who want to feel looked after."'
      >
        <textarea id="brandDescription" name="brandDescription" rows={3} defaultValue={defaults.brandDescription} className={inputCls} />
      </Field>

      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Words we love" htmlFor="wordsToUse" hint="Comma-separated.">
          <input id="wordsToUse" name="wordsToUse" defaultValue={defaults.wordsToUse} className={inputCls} placeholder="fresh, homemade, family" />
        </Field>
        <Field label="Words to avoid" htmlFor="wordsToAvoid" hint="Comma-separated.">
          <input id="wordsToAvoid" name="wordsToAvoid" defaultValue={defaults.wordsToAvoid} className={inputCls} placeholder="cheap, discount-blast" />
        </Field>
      </div>

      <Field label="Preferred call-to-action" htmlFor="ctaPreference">
        <input id="ctaPreference" name="ctaPreference" defaultValue={defaults.ctaPreference} className={inputCls} placeholder="Book on WhatsApp" />
      </Field>

      <fieldset className="border-t border-line pt-5">
        <legend className="sr-only">Watermark</legend>
        <div className="text-[13px] font-semibold mb-1">Your mark on every creative</div>
        <p className="text-xs text-ink-faint mb-4 max-w-[60ch]">
          We place this on flyers and can burn it into your videos, so your posts stay yours when
          people share them.
        </p>

        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input type="checkbox" name="watermarkEnabled" defaultChecked={defaults.watermarkEnabled} className="peer sr-only" />
          <span className="w-10 h-6 rounded-full bg-line-strong peer-checked:bg-leaf transition-colors relative shrink-0 after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          <span className="text-sm">Add my mark to creatives</span>
        </label>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Text mark" htmlFor="watermarkText" hint="Used when no logo is uploaded.">
            <input id="watermarkText" name="watermarkText" defaultValue={defaults.watermarkText} className={inputCls} placeholder="Your business name" />
          </Field>
          <Field label="Position" htmlFor="watermarkPosition">
            <select id="watermarkPosition" name="watermarkPosition" defaultValue={defaults.watermarkPosition} className={inputCls}>
              <option value="BOTTOM_RIGHT">Bottom right</option>
              <option value="BOTTOM_LEFT">Bottom left</option>
              <option value="TOP_RIGHT">Top right</option>
              <option value="TOP_LEFT">Top left</option>
              <option value="CENTER">Centre</option>
            </select>
          </Field>
          <Field label="Strength" htmlFor="watermarkOpacity">
            <select id="watermarkOpacity" name="watermarkOpacity" defaultValue={String(defaults.watermarkOpacity)} className={inputCls}>
              <option value="40">Subtle</option>
              <option value="60">Medium</option>
              <option value="75">Clear</option>
              <option value="100">Bold</option>
            </select>
          </Field>
        </div>
      </fieldset>

      <button type="submit" disabled={pending} className={btnStyles.primary + " self-start"}>
        {pending ? "Saving…" : "Save brand"}
      </button>
    </form>
  );
}
