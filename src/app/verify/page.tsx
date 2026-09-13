import Link from "next/link";
import { verifyEmailAction } from "@/server/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { btnStyles, FormError, FormSuccess } from "@/components/ui";

export const metadata = { title: "Verify email" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await verifyEmailAction(token)
    : { error: "This link is missing its token." };

  return (
    <AuthShell title="Email verification">
      <div className="flex flex-col gap-4">
        <FormError error={result.error} />
        <FormSuccess message={result.message} />
        <Link href="/app" className={btnStyles.primary}>
          Continue to Markit
        </Link>
      </div>
    </AuthShell>
  );
}
