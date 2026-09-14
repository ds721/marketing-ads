import { db } from "@/server/db";
import { getPlan } from "@/server/plans";
import { Card, Pill } from "@/components/ui";
import { TenantAdminActions } from "@/components/admin-actions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Businesses" };

export default async function AdminTenants() {
  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      members: { where: { role: "OWNER" }, include: { user: { select: { email: true } } }, take: 1 },
      _count: { select: { contentItems: true, campaigns: true } },
    },
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-[26px] font-bold mb-6">Businesses</h1>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-4 py-3 font-semibold">Business</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold text-right">Content</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-ink-faint">{t.slug}</div>
                </td>
                <td className="px-4 py-3 text-ink-soft">{t.members[0]?.user.email ?? "—"}</td>
                <td className="px-4 py-3">{getPlan(t.planId).name}</td>
                <td className="px-4 py-3">
                  <Pill tone={t.status === "ACTIVE" ? "leaf" : "chili"}>{t.status.toLowerCase()}</Pill>
                </td>
                <td className="px-4 py-3 text-ink-soft">{formatDate(t.createdAt)}</td>
                <td className="px-4 py-3 text-right tnum">{t._count.contentItems}</td>
                <td className="px-4 py-3 text-right">
                  <TenantAdminActions tenantId={t.id} status={t.status} planId={t.planId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
