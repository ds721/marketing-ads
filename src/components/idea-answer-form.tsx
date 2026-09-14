"use client";

import { useActionState } from "react";
import { answerIdeaAction } from "@/server/actions/marketing";
import type { FormState } from "@/server/actions/auth";
import { FormError, btnStyles, inputCls } from "@/components/ui";

const initial: FormState = {};

export function IdeaAnswerForm({
  slug,
  ideaId,
  questions,
}: {
  slug: string;
  ideaId: string;
  questions: string[];
}) {
  const [state, action, pending] = useActionState(
    answerIdeaAction.bind(null, slug, ideaId),
    initial,
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError error={state.error} />
      <div className="bg-saffron-tint rounded-[16px] px-5 py-4">
        <ul className="flex flex-col gap-1.5">
          {questions.map((q) => (
            <li key={q} className="text-[15px] font-semibold text-saffron-deep">
              {q}
            </li>
          ))}
        </ul>
      </div>
      <textarea
        name="answer"
        rows={3}
        required
        autoFocus
        placeholder="e.g. ₹199, running Saturday and Sunday"
        className={inputCls + " resize-none"}
      />
      <button type="submit" disabled={pending} className={btnStyles.primary + " self-start"}>
        {pending ? "Building your campaign…" : "Continue"}
      </button>
    </form>
  );
}
