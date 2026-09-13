import { requireTenant } from "@/server/tenant";
import { OnboardingShell } from "@/components/onboarding-shell";
import { AboutForm } from "@/components/onboarding-forms";

export const metadata = { title: "About your business" };

export default async function AboutStep({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireTenant(tenant, "ADMIN");
  return (
    <OnboardingShell
      step={2}
      title="Tell us about your business"
      subtitle="Write it the way you'd tell a friend. The AI turns this into marketing knowledge."
    >
      <AboutForm slug={tenant} />
    </OnboardingShell>
  );
}
