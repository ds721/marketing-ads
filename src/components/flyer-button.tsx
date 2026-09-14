"use client";

import { useTransition } from "react";
import { generateFlyerAction } from "@/server/actions/assets";
import { btnStyles } from "@/components/ui";

export function FlyerButton({ slug, campaignId }: { slug: string; campaignId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => generateFlyerAction(slug, campaignId))}
      className={btnStyles.secondary}
    >
      {pending ? "Making your flyer…" : "Make the flyer"}
    </button>
  );
}
