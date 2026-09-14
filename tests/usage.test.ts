import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "./setup";
import { PrismaClient } from "@prisma/client";
import { checkEntitlement, recordUsage, getRemainingUsage, UsageLimitError, currentPeriod } from "@/server/usage";
import { getPlan, PLANS } from "@/server/plans";

// ── Plan entitlements (§37–38) ────────────────────────────────────────────

const db = new PrismaClient();
let tenantId: string;

beforeAll(async () => {
  const t = await db.tenant.create({
    data: { slug: `usage-${Date.now()}`, name: "Usage Test", planId: "starter" },
  });
  tenantId = t.id;
});

afterAll(async () => {
  await db.tenant.delete({ where: { id: tenantId } });
  await db.$disconnect();
});

describe("usage limits", () => {
  it("reads limits from the plan table, never a hardcoded number", () => {
    expect(getPlan("starter").limits.ai_text).toBe(PLANS.starter.limits.ai_text);
    expect(getPlan("nonexistent-plan").id).toBe("starter");
    expect(PLANS.growth.limits.ai_text).toBeGreaterThan(PLANS.starter.limits.ai_text);
  });

  it("allows usage while the tenant has headroom", async () => {
    await expect(checkEntitlement(tenantId, "ai_image")).resolves.toBeUndefined();
  });

  it("counts recorded usage against the remaining balance", async () => {
    const before = await getRemainingUsage(tenantId, "ai_image");
    await recordUsage(tenantId, "ai_image", 3);
    const after = await getRemainingUsage(tenantId, "ai_image");
    expect(after.used).toBe(before.used + 3);
    expect(after.remaining).toBe(before.remaining - 3);
  });

  it("blocks the call that would exceed the plan", async () => {
    const { limit, used } = await getRemainingUsage(tenantId, "ai_image");
    await recordUsage(tenantId, "ai_image", limit - used);
    await expect(checkEntitlement(tenantId, "ai_image")).rejects.toBeInstanceOf(UsageLimitError);
  });

  it("tracks usage per period so limits reset each month", async () => {
    const period = currentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
    const rows = await db.usageRecord.findMany({ where: { tenantId, metric: "ai_image" } });
    expect(rows.every((r) => r.period === period)).toBe(true);
  });
});
