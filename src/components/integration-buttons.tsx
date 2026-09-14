"use client";

import { useTransition } from "react";
import { disconnectAccountAction } from "@/server/actions/social";

export function DisconnectButton({ slug, accountId }: { slug: string; accountId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Disconnect this account? Scheduled posts to it will stop.")) {
          start(() => disconnectAccountAction(slug, accountId));
        }
      }}
      className="text-xs font-semibold text-ink-faint hover:text-chili-deep cursor-pointer"
    >
      Disconnect
    </button>
  );
}
