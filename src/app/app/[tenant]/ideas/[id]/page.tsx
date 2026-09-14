import { notFound } from "next/navigation";
import { requireTenant } from "@/server/tenant";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { Card, Pill } from "@/components/ui";
import { IdeaAnswerForm } from "@/components/idea-answer-form";

export const metadata = { title: "One more detail" };

export default async function IdeaPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const ctx = await requireTenant(slug, "EDITOR");
  const idea = await db.idea.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!idea) notFound();

  return (
    <main className="px-6 md:px-10 py-8 max-w-2xl">
      <PageHeader
        title="I need one more detail"
        subtitle="I won't guess a price or a date — wrong numbers in an ad are worse than no ad."
      />

      <Card className="mb-5">
        <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-2">
          You said
        </div>
        <p className="text-[15px]">&ldquo;{idea.text}&rdquo;</p>
        {idea.classification && (
          <div className="mt-3">
            <Pill tone="beet">
              Understood as: {idea.classification.replace(/_/g, " ").toLowerCase()}
            </Pill>
          </div>
        )}
      </Card>

      <IdeaAnswerForm slug={slug} ideaId={idea.id} questions={idea.missingInfo} />
    </main>
  );
}
