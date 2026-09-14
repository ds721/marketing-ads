"use client";

import { useTransition } from "react";
import {
  approveContentAction,
  generateContentCopyAction,
} from "@/server/actions/marketing";
import type { ContentStatus } from "@prisma/client";

export function ContentRowActions({
  slug,
  item,
}: {
  slug: string;
  item: { id: string; status: ContentStatus; hasBody: boolean };
}) {
  const [pending, start] = useTransition();

  if (item.status === "DRAFT" && !item.hasBody) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => generateContentCopyAction(slug, item.id))}
        className="text-xs font-bold text-beet hover:text-beet-deep cursor-pointer disabled:opacity-50"
      >
        {pending ? "Writing…" : "Write this post"}
      </button>
    );
  }

  if (item.status === "NEEDS_REVIEW" || item.status === "AI_GENERATED") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => approveContentAction(slug, item.id))}
        className="text-xs font-bold text-leaf-deep hover:underline cursor-pointer disabled:opacity-50"
      >
        {pending ? "Approving…" : "Approve"}
      </button>
    );
  }

  return null;
}
