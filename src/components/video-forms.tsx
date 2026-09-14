"use client";

import { useActionState } from "react";
import { generateVideoScriptAction } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { Field, FormError, FormSuccess, inputCls, btnStyles } from "@/components/ui";

const initial: FormState = {};

const IDEAS = [
  "How we make our biryani",
  "Before and after — hair spa",
  "A day at the shop, start to finish",
  "The one thing customers always ask us",
];

export function VideoScriptForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(
    generateVideoScriptAction.bind(null, slug),
    initial,
  );

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-4 bg-surface border border-line rounded-[16px] p-5 shadow-soft">
        <FormError error={state.error} />
        <FormSuccess message={state.message} />

        <Field
          label="What should the video show?"
          htmlFor="topic"
          hint="Something that exists at your shop today — a dish, a treatment, your busiest hour."
        >
          <input
            id="topic"
            name="topic"
            required
            className={inputCls}
            placeholder="How we make our mutton biryani"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Format" htmlFor="format">
            <select id="format" name="format" className={inputCls} defaultValue="reel">
              <option value="reel">Reel — for the feed</option>
              <option value="story">Story — 24 hours</option>
              <option value="short">Short — general</option>
            </select>
          </Field>
          <Field label="Length" htmlFor="durationSec">
            <select id="durationSec" name="durationSec" className={inputCls} defaultValue="15">
              <option value="10">10 seconds</option>
              <option value="15">15 seconds</option>
              <option value="30">30 seconds</option>
              <option value="45">45 seconds</option>
            </select>
          </Field>
        </div>

        <button type="submit" disabled={pending} className={btnStyles.primary + " self-start"}>
          {pending ? "Planning your video…" : "Plan this video"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {IDEAS.map((idea) => (
          <span key={idea} className="text-xs text-ink-soft bg-surface-2 rounded-full px-3 py-1.5">
            &ldquo;{idea}&rdquo;
          </span>
        ))}
      </div>
    </div>
  );
}
