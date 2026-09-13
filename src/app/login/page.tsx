import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/tenant";
import { googleConfigured } from "@/server/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");
  return (
    <AuthShell title="Welcome back" subtitle="Log in to your marketing workspace.">
      <LoginForm googleEnabled={googleConfigured} />
    </AuthShell>
  );
}
