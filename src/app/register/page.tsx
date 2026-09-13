import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/tenant";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");
  return (
    <AuthShell
      title="Create your account"
      subtitle="Tell us about your business — we'll handle the marketing."
    >
      <RegisterForm />
    </AuthShell>
  );
}
