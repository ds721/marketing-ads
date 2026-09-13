"use client";

import { useActionState, useTransition } from "react";
import {
  addOfferAction,
  archiveOfferAction,
  deleteProductAction,
} from "@/server/actions/business";
import type { FormState } from "@/server/actions/auth";
import { Field, FormError, inputCls, btnStyles } from "@/components/ui";

const initial: FormState = {};

export function OfferForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(addOfferAction.bind(null, slug), initial);
  return (
    <form action={action} className="flex flex-col gap-3 bg-surface-2 rounded-[16px] p-4">
      <FormError error={state.error} />
      <Field label="Offer" htmlFor="otitle">
        <input id="otitle" name="title" required className={inputCls} placeholder="Biryani + Coke combo" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (₹, optional)" htmlFor="oprice">
          <input id="oprice" name="price" type="number" min="0" step="0.01" className={inputCls} placeholder="199" />
        </Field>
        <Field label="Ends on (optional)" htmlFor="oends">
          <input id="oends" name="endsAt" type="date" className={inputCls} />
        </Field>
      </div>
      <Field label="Details (optional)" htmlFor="odesc">
        <input id="odesc" name="description" className={inputCls} placeholder="Saturday & Sunday only" />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.tonal}>
        {pending ? "Adding…" : "+ Add offer"}
      </button>
    </form>
  );
}

export function DeleteProductButton({ slug, productId }: { slug: string; productId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Remove this product? The AI will stop promoting it.")) {
          startTransition(() => deleteProductAction(slug, productId));
        }
      }}
      className="text-xs font-semibold text-ink-faint hover:text-chili-deep cursor-pointer"
    >
      Remove
    </button>
  );
}

export function ArchiveOfferButton({ slug, offerId }: { slug: string; offerId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => archiveOfferAction(slug, offerId))}
      className="text-xs font-semibold text-ink-faint hover:text-chili-deep cursor-pointer"
    >
      End offer
    </button>
  );
}
