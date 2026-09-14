"use client";

import { useActionState, useTransition } from "react";
import {
  approveCampaignAction,
  rejectCampaignAction,
  regenerateCampaignAction,
} from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { FormError, btnStyles } from "@/components/ui";

const initial: FormState = {};

export function CampaignActions({ slug, campaignId }: { slug: string; campaignId: string }) {
  const [pending, start] = useTransition();
  const [regenState, regenAction, regenPending] = useActionState(
    regenerateCampaignAction.bind(null, slug, campaignId),
    initial,
  );
  const busy = pending || regenPending;

  return (
    <div className="flex flex-col gap-3">
      <FormError error={regenState.error} />
      <div className="flex flex-wrap gap-2.5 items-center">
        <button
          type="button"
          disabled={busy}
          onClick={() => start(() => approveCampaignAction(slug, campaignId))}
          className={btnStyles.primary + " px-6 py-3 text-[15px]"}
        >
          {pending ? "Approving…" : "Approve campaign"}
        </button>
        <form action={regenAction} className="contents">
          <button type="submit" disabled={busy} className={btnStyles.tonal}>
            {regenPending ? "Rebuilding…" : "Regenerate"}
          </button>
        </form>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm("Reject this campaign? Nothing will be published.")) {
              start(() => rejectCampaignAction(slug, campaignId));
            }
          }}
          className={btnStyles.ghost}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
