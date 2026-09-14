import { db } from "@/server/db";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AdminAudit() {
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { tenant: { select: { name: true } } },
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-[26px] font-bold mb-1">Audit log</h1>
      <p className="text-ink-soft text-sm mb-6">
        Every sensitive action, newest first. Written on the server — not editable from the app.
      </p>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Business</th>
              <th className="px-4 py-3 font-semibold">Target</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
                <td className="px-4 py-2.5 font-semibold">{l.action}</td>
                <td className="px-4 py-2.5">{l.tenant?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-faint text-xs">
                  {l.targetType ? `${l.targetType}:${l.targetId?.slice(0, 8)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
