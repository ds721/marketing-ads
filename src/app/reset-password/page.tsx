import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Set new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-ink-soft text-sm">
          This link is missing its token. Request a fresh one from the forgot-password page.
        </p>
      )}
    </AuthShell>
  );
}
