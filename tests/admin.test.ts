import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "./setup";
import { PrismaClient } from "@prisma/client";
import { platformMetrics, tenantDetail } from "@/server/metrics";
import { PLANS } from "@/server/plans";

// ── Platform metrics (§31) ────────────────────────────────────────────────
// Revenue on an admin dashboard is a number someone makes decisions on, so it
// must never count tenants who haven't actually agreed to pay.

const db = new PrismaClient();
const created: string[] = [];

async function makeTenant(
  planId: string,
  subStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED",
  tenantStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE",
) {
  const t = await db.tenant.create({
    data: {
      slug: `metrics-${planId}-${subStatus}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `Metrics ${planId}`,
      planId,
      status: tenantStatus,
      subscription: { create: { planId, status: subStatus } },
    },
  });
  created.push(t.id);
  return t;
}

let baseline: Awaited<ReturnType<typeof platformMetrics>>;

beforeAll(async () => {
  baseline = await platformMetrics();
});

afterAll(async () => {
  await db.tenant.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

describe("contracted MRR", () => {
  it("counts a paying tenant", async () => {
    await makeTenant("growth", "ACTIVE");
    const m = await platformMetrics();
    expect(m.contractedMrrInr).toBe(baseline.contractedMrrInr + PLANS.growth.priceInrMonthly);
    expect(m.payingTenants).toBe(baseline.payingTenants + 1);
  });

  it("does NOT count a trialing tenant as revenue", async () => {
    const before = await platformMetrics();
    await makeTenant("pro", "TRIALING");
    const after = await platformMetrics();
    // Regression: MRR used to sum plan prices for every tenant, so a trial on
    // the Pro plan showed ₹5,999 of revenue that nobody had agreed to pay.
    expect(after.contractedMrrInr).toBe(before.contractedMrrInr);
    expect(after.trialingTenants).toBe(before.trialingTenants + 1);
  });

  it("does NOT count a past-due tenant as revenue", async () => {
    const before = await platformMetrics();
    await makeTenant("growth", "PAST_DUE");
    const after = await platformMetrics();
    expect(after.contractedMrrInr).toBe(before.contractedMrrInr);
    expect(after.pastDueTenants).toBe(before.pastDueTenants + 1);
  });

  it("drops a suspended tenant out of revenue entirely", async () => {
    const before = await platformMetrics();
    await makeTenant("pro", "ACTIVE", "SUSPENDED");
    const after = await platformMetrics();
    expect(after.contractedMrrInr).toBe(before.contractedMrrInr);
    expect(after.suspendedTenants).toBe(before.suspendedTenants + 1);
  });

  it("reports whether a payment provider is actually connected", async () => {
    const m = await platformMetrics();
    expect(m.billingConnected).toBe(Boolean(process.env.PAYMENT_PROVIDER));
  });
});

describe("tenant detail", () => {
  it("returns null for an id that doesn't exist", async () => {
    expect(await tenantDetail("does-not-exist")).toBeNull();
  });

  it("reports usage, setup and members for one business", async () => {
    const t = await makeTenant("starter", "ACTIVE");
    await db.product.create({ data: { tenantId: t.id, name: "Test product" } });
    await db.usageRecord.create({
      data: {
        tenantId: t.id,
        metric: "ai_text",
        amount: 4,
        period: `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`,
      },
    });

    const detail = await tenantDetail(t.id);
    expect(detail).not.toBeNull();
    expect(detail!.tenant._count.products).toBe(1);
    expect(detail!.usage.ai_text).toBe(4);
    expect(detail!.lastActivityAt).toBeNull(); // no content created yet
  });

  it("scopes every figure to the one tenant", async () => {
    const a = await makeTenant("starter", "ACTIVE");
    const b = await makeTenant("starter", "ACTIVE");
    await db.contentItem.create({
      data: { tenantId: b.id, platform: "instagram", title: "B's post", body: "b" },
    });

    const detailA = await tenantDetail(a.id);
    const detailB = await tenantDetail(b.id);
    expect(Object.keys(detailA!.contentByStatus)).toHaveLength(0);
    expect(detailB!.contentByStatus.DRAFT).toBe(1);
  });
});
