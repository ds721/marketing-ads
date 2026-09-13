import { requireUser } from "@/server/tenant";
import { OnboardingShell } from "@/components/onboarding-shell";
import { CreateBusinessForm } from "@/components/onboarding-forms";

export const metadata = { title: "Set up your business" };

export default async function OnboardingStart() {
  await requireUser();
  return (
    <OnboardingShell
      step={1}
      title="Let's set up your business"
      subtitle="A few basics first. Everything can be changed later."
    >
      <CreateBusinessForm />
    </OnboardingShell>
  );
}
