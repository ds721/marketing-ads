import Link from "next/link";
import { requireTenant, listUserTenants, TenantAccessError } from "@/server/tenant";
import { signOut } from "@/server/auth";
import { SidebarNav } from "@/components/sidebar-nav";
import { btnStyles } from "@/components/ui";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  let ctx;
  try {
    ctx = await requireTenant(slug);
  } catch (err) {
    if (err instanceof TenantAccessError) {
      return (
        <main className="min-h-screen flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <h1 className="text-2xl font-bold mb-2">No access</h1>
            <p className="text-ink-soft mb-6">{err.message}</p>
            <Link href="/app" className={btnStyles.primary}>
              Back to my businesses
            </Link>
          </div>
        </main>
      );
    }
    throw err;
  }

  const memberships = await listUserTenants(ctx.userId);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-line bg-surface md:min-h-screen p-4 md:p-5 flex md:flex-col gap-4 md:gap-0 items-center md:items-stretch">
        <Link href="/app" className="font-display font-extrabold text-lg tracking-tight md:mb-6 shrink-0">
          markit<span className="text-beet">*</span>
        </Link>
        <div className="md:mb-6 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint hidden md:block mb-1">
            Business
          </div>
          <div className="font-bold text-sm truncate">{ctx.tenant.name}</div>
          {memberships.length > 1 && (
            <Link href="/app" className="text-xs text-beet font-semibold hover:underline hidden md:inline-block">
              Switch business
            </Link>
          )}
        </div>
        <SidebarNav slug={slug} role={ctx.role} />
        <form
          className="md:mt-auto ml-auto md:ml-0"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-sm text-ink-soft hover:text-ink font-medium cursor-pointer">
            Log out
          </button>
        </form>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
