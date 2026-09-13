import Link from "next/link";
import { requireTenant } from "@/server/tenant";
import { db } from "@/server/db";
import { OnboardingShell } from "@/components/onboarding-shell";
import { AddProductForm } from "@/components/onboarding-forms";
import { btnStyles } from "@/components/ui";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "Products & services" };

export default async function ProductsStep({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant, "ADMIN");
  const products = await db.product.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <OnboardingShell
      step={3}
      title="What do you sell?"
      subtitle="Add your main products or services. The AI only ever promotes what's on this list — it never invents."
    >
      <div className="flex flex-col gap-4">
        {products.length > 0 && (
          <ul className="flex flex-col gap-2">
            {products.map((p) => (
              <li key={p.id} className="flex items-center justify-between bg-surface border border-line rounded-[12px] px-4 py-3">
                <div>
                  <span className="font-semibold text-sm">{p.name}</span>
                  <span className="text-xs text-ink-faint ml-2">{p.kind === "SERVICE" ? "Service" : "Product"}</span>
                </div>
                <span className="text-sm font-semibold tnum">{p.price ? formatINR(Number(p.price)) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
        <AddProductForm slug={tenant} />
        <div className="flex items-center justify-between mt-2">
          <Link href={`/onboarding/${tenant}/audience`} className="text-sm text-ink-soft hover:text-ink">
            Skip for now
          </Link>
          <Link href={`/onboarding/${tenant}/audience`} className={btnStyles.primary}>
            Continue
          </Link>
        </div>
      </div>
    </OnboardingShell>
  );
}
