"use client";

import { useActionState } from "react";
import { submitIdeaAction } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { FormError, btnStyles } from "@/components/ui";
import { LookPicker } from "@/components/look-picker";
import type { LookPreview, PhotoChoice } from "@/server/creative/looks";

const initial: FormState = {};

const EXAMPLES = [
  "Biryani + Coke combo for ₹199 this weekend",
  "New hair colouring service available",
  "We're celebrating our 5th anniversary",
  "We have 50 extra cakes today",
  "We're closed tomorrow",
];

export function IdeaComposer({
  slug,
  autoFocus = false,
  looks,
  photos,
  defaultLook,
}: {
  slug: string;
  autoFocus?: boolean;
  looks: LookPreview[];
  photos: PhotoChoice[];
  defaultLook: string;
}) {
  const [state, action, pending] = useActionState(submitIdeaAction.bind(null, slug), initial);

  return (
    <div className="flex flex-col gap-3">
      <FormError error={state.error} />
      <form action={action} className="flex flex-col gap-3">
        <textarea
          name="text"
          rows={3}
          required
          autoFocus={autoFocus}
          disabled={pending}
          placeholder="What's happening in your business?"
          className="w-full bg-surface border-[1.5px] border-line-strong rounded-[16px] px-5 py-4 text-[15px] text-ink placeholder:text-ink-faint focus:border-beet focus:outline-none shadow-soft resize-none"
        />
        <div className="bg-surface border border-line rounded-[16px] p-4">
          <LookPicker looks={looks} photos={photos} defaultLook={defaultLook} />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-ink-faint">
            Plain words are enough — the AI works out what kind of marketing this needs.
          </span>
          <button type="submit" disabled={pending} className={btnStyles.idea}>
            {pending ? "Working on it…" : "Make it happen"}
          </button>
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <span key={e} className="text-xs text-ink-soft bg-surface-2 rounded-full px-3 py-1.5">
            &ldquo;{e}&rdquo;
          </span>
        ))}
      </div>
    </div>
  );
}
