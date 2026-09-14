"use client";

import { useActionState } from "react";
import { generateStrategyAction } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { FormError, FormSuccess, btnStyles } from "@/components/ui";

const initial: FormState = {};

export function GenerateStrategyButton({
  slug,
  label = "Build this month's plan",
}: {
  slug: string;
  label?: string;
}) {
  const [state, action, pending] = useActionState(
    generateStrategyAction.bind(null, slug),
    initial,
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />
      <button type="submit" disabled={pending} className={btnStyles.primary + " self-start"}>
        {pending ? "Planning your month…" : label}
      </button>
    </form>
  );
}
