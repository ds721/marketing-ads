"use client";

import { useState, useTransition } from "react";
import { beginConnectAction, disconnectAccountAction } from "@/server/actions/social";
import { btnStyles, FormError } from "@/components/ui";

export function ConnectButton({
  slug,
  provider,
  label,
  available,
}: {
  slug: string;
  provider: string;
  label: string;
  available: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-col gap-2 items-end">
      <FormError error={error} />
      <button
        type="button"
        disabled={pending || !available}
        onClick={() =>
          start(async () => {
            const result = await beginConnectAction(slug, provider);
            setError(result.error);
          })
        }
        className={btnStyles.primary}
      >
        {pending ? "Opening…" : label}
      </button>
    </div>
  );
}

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
