"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requirePlatformAdmin } from "@/server/tenant";
import { audit } from "@/server/audit";
import { PLANS } from "@/server/plans";

// Every action here is platform-admin only and every one is audited (§31).

const idSchema = z.string().cuid();

export async function setTenantStatusAction(
  tenantId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<void> {
  const admin = await requirePlatformAdmin();
  const id = idSchema.parse(tenantId);

  await db.tenant.update({ where: { id }, data: { status } });
  await audit({
    tenantId: id,
    userId: admin.id,
    action: status === "SUSPENDED" ? "admin.tenant.suspend" : "admin.tenant.reactivate",
    targetType: "tenant",
    targetId: id,
  });
  revalidatePath("/admin/tenants");
}

export async function setTenantPlanAction(tenantId: string, planId: string): Promise<void> {
  const admin = await requirePlatformAdmin();
  const id = idSchema.parse(tenantId);
  if (!(planId in PLANS)) throw new Error("Unknown plan.");

  await db.$transaction([
    db.tenant.update({ where: { id }, data: { planId } }),
    db.subscription.upsert({
      where: { tenantId: id },
      create: { tenantId: id, planId, status: "ACTIVE" },
      update: { planId },
    }),
  ]);
  await audit({
    tenantId: id,
    userId: admin.id,
    action: "admin.tenant.change_plan",
    targetType: "tenant",
    targetId: id,
    meta: { planId },
  });
  revalidatePath("/admin/tenants");
}
