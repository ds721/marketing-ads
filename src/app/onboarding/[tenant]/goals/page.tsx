import { requireTenant } from "@/server/tenant";
import { OnboardingShell } from "@/components/onboarding-shell";
import { GoalsForm } from "@/components/onboarding-forms";

export const metadata = { title: "Marketing goals" };

export default async function GoalsStep({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireTenant(tenant, "ADMIN");
  return (
    <OnboardingShell
      step={5}
      title="What are we trying to achieve?"
      subtitle="The AI builds your whole strategy around this — not around 'posting content'."
    >
      <GoalsForm slug={tenant} />
    </OnboardingShell>
  );
}
