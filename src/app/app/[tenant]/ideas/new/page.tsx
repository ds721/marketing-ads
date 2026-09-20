import { requireTenant } from "@/server/tenant";
import { PageHeader } from "@/components/page-header";
import { IdeaStudio } from "@/components/idea-studio";
import { lookPreviews } from "@/server/creative/looks";

export const metadata = { title: "New marketing idea" };

export default async function NewIdeaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant, "EDITOR");
  const picker = await lookPreviews(ctx.tenant.id);
  return (
    <main className="px-6 md:px-10 py-8 max-w-6xl">
      <PageHeader
        title="What's happening in your business?"
        subtitle="A new product, an offer, an event, a quiet day you'd like to fill — just say it in your own words."
      />
      <IdeaStudio slug={tenant} {...picker} />
    </main>
  );
}
