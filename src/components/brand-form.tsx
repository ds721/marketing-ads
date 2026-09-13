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

      <button type="submit" disabled={pending} className={btnStyles.primary + " self-start"}>
        {pending ? "Saving…" : "Save brand"}
      </button>
    </form>
  );
}
