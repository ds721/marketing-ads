import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { AddProductForm } from "@/components/onboarding-forms";
import { OfferForm, DeleteProductButton, ArchiveOfferButton } from "@/components/product-forms";
import { Card, EmptyState, Pill, SectionLabel } from "@/components/ui";
import { formatINR, formatDate } from "@/lib/utils";

export const metadata = { title: "Products & offers" };

export default async function ProductsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant);
  const canEdit = roleAtLeast(ctx.role, "EDITOR");

  const [products, offers] = await Promise.all([
    db.product.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { createdAt: "asc" } }),
    db.offer.findMany({
      where: { tenantId: ctx.tenant.id, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <main className="px-6 md:px-10 py-8 max-w-5xl">
      <PageHeader
        title="Products & offers"
        subtitle="The AI only promotes what's listed here — prices come from this page, never from imagination."
      />

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        <section>
          <SectionLabel>Products & services</SectionLabel>
          {products.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              body="Add what you sell so the AI can start promoting it."
            />
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {products.map((p) => (
                <Card key={p.id} className="flex items-center justify-between py-3.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-xs text-ink-soft">
                      {p.kind === "SERVICE" ? "Service" : "Product"}
                      {p.category ? ` · ${p.category}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold tnum">
                      {p.price ? formatINR(Number(p.price)) : "—"}
                    </span>
                    {canEdit && <DeleteProductButton slug={tenant} productId={p.id} />}
                  </div>
                </Card>
              ))}
            </div>
          )}
          {canEdit && <AddProductForm slug={tenant} />}
        </section>

        <section>
          <SectionLabel>Active offers</SectionLabel>
          {offers.length === 0 ? (
            <EmptyState
              title="No offers running"
              body='Have a promotion? Add it here — or just hit "New Marketing Idea" and type it.'
            />
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {offers.map((o) => (
                <Card key={o.id} className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{o.title}</div>
                      <div className="text-xs text-ink-soft">
                        {o.price ? `${formatINR(Number(o.price))} · ` : ""}
                        {o.endsAt ? `ends ${formatDate(o.endsAt)}` : "no end date"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Pill tone="saffron">Offer</Pill>
                      {canEdit && <ArchiveOfferButton slug={tenant} offerId={o.id} />}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {canEdit && <OfferForm slug={tenant} />}
        </section>
      </div>
    </main>
  );
}
