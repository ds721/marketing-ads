import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";

export async function audit(entry: {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Prisma.InputJsonValue;
}) {
  try {
    await db.auditLog.create({
      data: {
        tenantId: entry.tenantId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        meta: entry.meta,
      },
    });
  } catch (err) {
    // Auditing must never take the request down, but a silent gap is a finding.
    console.error("audit_write_failed", entry.action, err);
  }
}
