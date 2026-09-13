import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, listUserTenants } from "@/server/tenant";
import { Card, btnStyles } from "@/components/ui";
import { signOut } from "@/server/auth";

export const metadata = { title: "My businesses" };

export default async function BusinessPickerPage() {
  const user = await requireUser();
  const memberships = await listUserTenants(user.id);

  if (memberships.length === 0) redirect("/onboarding");
  if (memberships.length === 1) redirect(`/app/${memberships[0]!.tenant.slug}/dashboard`);

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">My businesses</h1>
      <p className="text-ink-soft mb-8">Pick a workspace to continue.</p>
      <div className="grid gap-4">
        {memberships.map((m) => (
          <Link key={m.id} href={`/app/${m.tenant.slug}/dashboard`}>
            <Card className="flex items-center justify-between hover:shadow-lift transition-shadow">
              <div>
                <div className="font-bold text-lg">{m.tenant.name}</div>
                <div className="text-sm text-ink-soft capitalize">{m.role.toLowerCase()}</div>
              </div>
              <span className="text-beet font-bold">→</span>
            </Card>
          </Link>
        ))}
      </div>
      <div className="flex gap-3 mt-8">
        <Link href="/onboarding" className={btnStyles.secondary}>
          + Add a business
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className={btnStyles.ghost}>
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}
