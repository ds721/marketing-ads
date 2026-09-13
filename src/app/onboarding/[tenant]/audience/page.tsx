import { requireTenant } from "@/server/tenant";
import { OnboardingShell } from "@/components/onboarding-shell";
import { AudienceForm } from "@/components/onboarding-forms";

export const metadata = { title: "Your customers" };

export default async function AudienceStep({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireTenant(tenant, "ADMIN");
  return (
    <OnboardingShell
      step={4}
      title="Who are your customers?"
      subtitle="This shapes the tone, timing and platforms of everything we create."
    >
      <AudienceForm slug={tenant} />
    </OnboardingShell>
  );
}
