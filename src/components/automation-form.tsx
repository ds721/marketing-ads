"use client";

import { useActionState, useState } from "react";
import { saveAutomationAction } from "@/server/actions/social";
import type { FormState } from "@/server/actions/auth";
import { Field, FormError, FormSuccess, inputCls, btnStyles } from "@/components/ui";
import { cn } from "@/lib/utils";

const initial: FormState = {};

const LEVELS = [
  { value: "MANUAL", label: "Manual", note: "Markit writes everything. You approve every post." },
  { value: "ASSISTED", label: "Assisted", note: "Markit writes and schedules. You approve campaigns." },
  { value: "AUTOMATED", label: "Automated", note: "Markit publishes on its own, within your rules." },
];

export function AutomationForm({
  slug,
  defaults,
}: {
  slug: string;
  defaults: {
    level: string;
    aiReplanning: boolean;
    requireApprovalForPromotions: boolean;
    maxPostsPerWeek: number;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
    paused: boolean;
  };
}) {
  const [state, action, pending] = useActionState(saveAutomationAction.bind(null, slug), initial);
  const [level, setLevel] = useState(defaults.level);

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />

      <div className="grid gap-2.5">
        {LEVELS.map((l) => (
          <label key={l.value} className="cursor-pointer">
            <input
              type="radio"
              name="level"
              value={l.value}
              defaultChecked={defaults.level === l.value}
              onChange={() => setLevel(l.value)}
              className="peer sr-only"
            />
            <span className="flex items-center justify-between gap-3 rounded-[16px] border-2 border-line bg-surface px-5 py-4 peer-checked:border-beet peer-checked:bg-beet-tint transition-colors">
              <span className="font-bold">{l.label}</span>
              <span className="text-[13px] text-ink-soft text-right">{l.note}</span>
            </span>
          </label>
        ))}
      </div>

      {level === "AUTOMATED" && (
        <p className="bg-saffron-tint text-saffron-deep text-sm rounded-[12px] px-4 py-3">
          Markit will publish without asking. Your rules below still apply, and you can pause
          everything at any time.
        </p>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Max posts per week" htmlFor="maxPostsPerWeek">
          <input
            id="maxPostsPerWeek"
            name="maxPostsPerWeek"
            type="number"
            min={1}
            max={21}
            defaultValue={defaults.maxPostsPerWeek}
            className={inputCls}
          />
        </Field>
        <Field label="No posts after" htmlFor="quietHoursStart">
          <select id="quietHoursStart" name="quietHoursStart" defaultValue={defaults.quietHoursStart ?? ""} className={inputCls}>
            <option value="">No limit</option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{`${h}:00`}</option>
            ))}
          </select>
        </Field>
        <Field label="…until" htmlFor="quietHoursEnd">
          <select id="quietHoursEnd" name="quietHoursEnd" defaultValue={defaults.quietHoursEnd ?? ""} className={inputCls}>
            <option value="">No limit</option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{`${h}:00`}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-col gap-2.5">
        <Toggle name="aiReplanning" label="Let Markit reshuffle the calendar when a new offer comes up" defaultChecked={defaults.aiReplanning} />
        <Toggle name="requireApprovalForPromotions" label="Always ask me before publishing a promotion" defaultChecked={defaults.requireApprovalForPromotions} />
        <Toggle name="paused" label="Pause all marketing for now" defaultChecked={defaults.paused} />
      </div>

      <button type="submit" disabled={pending} className={cn(btnStyles.primary, "self-start")}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="w-10 h-6 rounded-full bg-line-strong peer-checked:bg-leaf transition-colors relative shrink-0 after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
      <span className="text-sm">{label}</span>
    </label>
  );
}
