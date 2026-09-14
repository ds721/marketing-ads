import { requireTenant } from "@/server/tenant";
import { PageHeader } from "@/components/page-header";
import { IdeaComposer } from "@/components/idea-composer";

export const metadata = { title: "New marketing idea" };

export default async function NewIdeaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireTenant(tenant, "EDITOR");
  return (
    <main className="px-6 md:px-10 py-8 max-w-2xl">
      <PageHeader
        title="What's happening in your business?"
        subtitle="A new product, an offer, an event, a quiet day you'd like to fill — just say it in your own words."
      />
      <IdeaComposer slug={tenant} autoFocus />
    </main>
  );
}
