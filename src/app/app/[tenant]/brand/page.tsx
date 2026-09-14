import { requireTenant } from "@/server/tenant";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { BrandForm } from "@/components/brand-form";

export const metadata = { title: "Brand" };

export default async function BrandPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant, "ADMIN");
  const brand = await db.brandSettings.findUniqueOrThrow({ where: { tenantId: ctx.tenant.id } });

  return (
    <main className="px-6 md:px-10 py-8 max-w-3xl">
      <PageHeader
        title="Brand"
        subtitle="Every caption, flyer and reply the AI creates follows what you set here."
      />
      <BrandForm
        slug={tenant}
        defaults={{
          primaryColor: brand.primaryColor ?? "#D6367B",
          secondaryColor: brand.secondaryColor ?? "#2E2447",
          accentColor: brand.accentColor ?? "#F5A31C",
          toneOfVoice: brand.toneOfVoice ?? "",
          brandDescription: brand.brandDescription ?? "",
          wordsToUse: brand.wordsToUse.join(", "),
          wordsToAvoid: brand.wordsToAvoid.join(", "),
          ctaPreference: brand.ctaPreference ?? "",
          watermarkEnabled: brand.watermarkEnabled,
          watermarkText: brand.watermarkText ?? "",
          watermarkPosition: brand.watermarkPosition,
          watermarkOpacity: brand.watermarkOpacity,
        }}
      />
    </main>
  );
}
