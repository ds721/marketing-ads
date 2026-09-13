import { requireTenant } from "@/server/tenant";
import { OnboardingShell } from "@/components/onboarding-shell";
import { FrequencyForm } from "@/components/onboarding-forms";

export const metadata = { title: "Posting frequency" };

export default async function FrequencyStep({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireTenant(tenant, "ADMIN");
  return (
    <OnboardingShell
      step={6}
      title="How often should we post?"
      subtitle="You can change this anytime — and the AI never exceeds your limit."
    >
      <FrequencyForm slug={tenant} />
    </OnboardingShell>
  );
}
