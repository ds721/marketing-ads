"use client";

import { useActionState } from "react";
import { generateInsightsAction } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { FormError, FormSuccess, btnStyles } from "@/components/ui";

const initial: FormState = {};

export function GenerateInsightsButton({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(
    generateInsightsAction.bind(null, slug),
    initial,
  );
  return (
    <form action={action} className="flex flex-col gap-2 items-end">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Looking at your results…" : "Analyse my results"}
      </button>
    </form>
  );
}
