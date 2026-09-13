"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createBusinessAction,
  saveAboutAction,
  addProductAction,
  saveAudienceAction,
  saveGoalsAction,
  saveFrequencyAction,
} from "@/server/actions/business";
import type { FormState } from "@/server/actions/auth";
import { Field, FormError, inputCls, btnStyles } from "@/components/ui";
import { cn } from "@/lib/utils";

const initial: FormState = {};

const CATEGORIES = [
  "Restaurant", "Salon", "Gym", "Bakery", "Boutique", "Retail store",
  "Clinic", "Tuition centre", "Local service", "Freelancer", "Other",
];

export function CreateBusinessForm() {
  const [state, action, pending] = useActionState(createBusinessAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError error={state.error} />
      <Field label="Business name" htmlFor="name">
        <input id="name" name="name" required className={inputCls} placeholder="Glow Salon" />
      </Field>
      <Field label="What kind of business?" htmlFor="category">
        <select id="category" name="category" required className={inputCls} defaultValue="">
          <option value="" disabled>Choose one…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" htmlFor="city">
          <input id="city" name="city" className={inputCls} placeholder="Chennai" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <input id="phone" name="phone" className={inputCls} placeholder="+91 98…" />
        </Field>
      </div>
      <Field label="Website (optional)" htmlFor="website">
        <input id="website" name="website" type="url" className={inputCls} placeholder="https://…" />
      </Field>
      <Field label="Address (optional)" htmlFor="address">
        <input id="address" name="address" className={inputCls} />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}

export function AboutForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(saveAboutAction.bind(null, slug), initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError error={state.error} />
      <Field
        label="Tell us about your business"
        htmlFor="about"
        hint="Plain words are perfect. Who are you, what do you sell, who comes to you?"
      >
        <textarea
          id="about"
          name="about"
          rows={6}
          required
          className={inputCls}
          placeholder="We are a family-owned bakery in Chennai. We sell cakes, pastries and custom birthday cakes. Our main customers are families and young professionals."
        />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

export function AddProductForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(addProductAction.bind(null, slug), initial);
  return (
    <form action={action} className="flex flex-col gap-3 bg-surface-2 rounded-[16px] p-4">
      <FormError error={state.error} />
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Name" htmlFor="pname">
          <input id="pname" name="name" required className={inputCls} placeholder="Hair spa treatment" />
        </Field>
        <Field label="Type" htmlFor="pkind">
          <select id="pkind" name="kind" className={inputCls}>
            <option value="PRODUCT">Product</option>
            <option value="SERVICE">Service</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (₹, optional)" htmlFor="pprice">
          <input id="pprice" name="price" type="number" min="0" step="0.01" className={inputCls} />
        </Field>
        <Field label="Category (optional)" htmlFor="pcat">
          <input id="pcat" name="category" className={inputCls} placeholder="Hair care" />
        </Field>
      </div>
      <Field label="Description (optional)" htmlFor="pdesc">
        <input id="pdesc" name="description" className={inputCls} />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.tonal}>
        {pending ? "Adding…" : "+ Add"}
      </button>
    </form>
  );
}

export function AudienceForm({ slug, defaults }: { slug: string; defaults?: { description?: string; location?: string; ageRange?: string } }) {
  const [state, action, pending] = useActionState(saveAudienceAction.bind(null, slug), initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError error={state.error} />
      <Field
        label="Who are your customers?"
        htmlFor="audience"
        hint="Not sure? Just describe who walks in the door most often — the AI will refine it over time."
      >
        <textarea
          id="audience"
          name="audience"
          rows={4}
          required
          className={inputCls}
          defaultValue={defaults?.description}
          placeholder="Mostly women 25–45 from nearby neighbourhoods. Working professionals and mothers. They care about quality and trust."
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Area / locality" htmlFor="location">
          <input id="location" name="location" className={inputCls} defaultValue={defaults?.location} placeholder="Anna Nagar + 5 km" />
        </Field>
        <Field label="Age range" htmlFor="ageRange">
          <input id="ageRange" name="ageRange" className={inputCls} defaultValue={defaults?.ageRange} placeholder="25–45" />
        </Field>
      </div>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

const GOALS = [
  "Increase customers", "Increase bookings", "Increase sales",
  "Promote products", "Promote services", "Generate leads",
  "Increase awareness", "Increase website traffic", "Increase social engagement",
];

export function GoalsForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(saveGoalsAction.bind(null, slug), initial);
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormError error={state.error} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="text-[13px] font-semibold mb-3">What are we trying to achieve? Pick one or more.</legend>
        {GOALS.map((g) => (
          <label key={g} className="cursor-pointer">
            <input type="checkbox" name="goals" value={g} className="peer sr-only" />
            <span className="inline-block text-sm font-semibold px-4 py-2 rounded-full border border-line-strong text-ink-soft peer-checked:bg-beet peer-checked:text-white peer-checked:border-beet transition-colors">
              {g}
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="A number to aim for this month (optional)" htmlFor="target" hint="E.g. 30 new bookings. We'll track progress against it.">
        <input id="target" name="target" type="number" min="1" className={cn(inputCls, "max-w-40")} />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

const FREQUENCIES = [
  { value: "daily", label: "Daily", note: "Best for restaurants & food" },
  { value: "3_per_week", label: "3 times a week", note: "Recommended for most businesses" },
  { value: "weekly", label: "Weekly", note: "Light but consistent" },
  { value: "custom", label: "Let the AI decide", note: "Adjusts to your goals & results" },
];

export function FrequencyForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(saveFrequencyAction.bind(null, slug), initial);
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormError error={state.error} />
      <div className="grid gap-3">
        {FREQUENCIES.map((f, i) => (
          <label key={f.value} className="cursor-pointer">
            <input type="radio" name="frequency" value={f.value} defaultChecked={i === 1} className="peer sr-only" />
            <span className="flex items-center justify-between rounded-[16px] border-2 border-line px-5 py-4 peer-checked:border-beet peer-checked:bg-beet-tint transition-colors">
              <span className="font-bold">{f.label}</span>
              <span className="text-sm text-ink-soft">{f.note}</span>
            </span>
          </label>
        ))}
      </div>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Finishing up…" : "Finish setup"}
      </button>
    </form>
  );
}

export function OnboardingSkipLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-ink-soft hover:text-ink text-center mt-3">
      {children}
    </Link>
  );
}
