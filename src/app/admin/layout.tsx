import Link from "next/link";
import { requirePlatformAdmin } from "@/server/tenant";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/admin" className="font-display font-extrabold text-lg tracking-tight">
            markit<span className="text-beet">*</span>
            <span className="text-ink-faint font-sans font-semibold text-sm ml-2">admin</span>
          </Link>
          <nav className="flex gap-1 ml-4">
            <Link href="/admin" className="text-sm font-semibold px-3 py-1.5 rounded-[10px] text-ink-soft hover:text-ink hover:bg-surface-2">
              Overview
            </Link>
            <Link href="/admin/tenants" className="text-sm font-semibold px-3 py-1.5 rounded-[10px] text-ink-soft hover:text-ink hover:bg-surface-2">
              Businesses
            </Link>
            <Link href="/admin/audit" className="text-sm font-semibold px-3 py-1.5 rounded-[10px] text-ink-soft hover:text-ink hover:bg-surface-2">
              Audit log
            </Link>
          </nav>
          <Link href="/app" className="ml-auto text-sm text-ink-soft hover:text-ink">
            Back to app
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
