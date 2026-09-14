import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "./setup";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { submitIdea } from "@/server/marketing/ideas";
import { approveCampaign } from "@/server/marketing/campaigns";
import { generateMonthlyStrategy } from "@/server/marketing/strategy";
import { monthKey } from "@/lib/utils";

// ── Core acceptance scenario (§58) ────────────────────────────────────────
// "Biryani + Coke for ₹199 this weekend" → campaign, assets, calendar,
// approval — with the price surviving the whole pipeline untouched.

const db = new PrismaClient();
let tenantId: string;
let userId: string;

beforeAll(async () => {
  const user = await db.user.create({
    data: { email: `accept-${Date.now()}@test.dev`, passwordHash: await hash("password123", 4) },
  });
  userId = user.id;

  const tenant = await db.tenant.create({
    data: {
      slug: `spice-accept-${Date.now()}`,
      name: "Spice House",
      planId: "growth",
      members: { create: { userId, role: "OWNER" } },
      businessProfile: {
        create: { category: "Restaurant", city: "Chennai", phone: "+91 98410 55555" },
      },
      brandSettings: { create: { toneOfVoice: "Friendly & local", ctaPreference: "Order now" } },
      automation: { create: { level: "ASSISTED", autoSchedule: true, requireApprovalForPromotions: true } },
      products: { create: [{ name: "Chicken biryani", price: 220 }] },
      goals: { create: [{ label: "Increase sales", month: monthKey() }] },
    },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  await db.tenant.delete({ where: { id: tenantId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("end-to-end: one sentence becomes a reviewable campaign", () => {
  let campaignId: string;

  it("understands the idea, classifies it, and builds a campaign", async () => {
    const result = await submitIdea({
      tenantId,
      userId,
      text: "Biryani + Coke combo for ₹199 this weekend",
    });

    expect(result.missingInfo).toHaveLength(0);
    expect(result.idea.classification).toBe("PROMOTION");
    expect(result.campaignId).toBeDefined();
    campaignId = result.campaignId!;
  });

  it("locks the price exactly as the owner typed it", async () => {
    const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const facts = campaign.facts as Record<string, string | null>;
    expect(facts.price).toBe("₹199");
    expect(facts.daysOrTimes).toBe("Saturday & Sunday");
  });

  it("creates an Instagram post and story, all scoped to this tenant", async () => {
    const items = await db.contentItem.findMany({ where: { campaignId, tenantId } });
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((i) => i.tenantId === tenantId)).toBe(true);
    expect(items.every((i) => i.status === "NEEDS_REVIEW")).toBe(true);
    expect(items.every((i) => i.aiGenerated)).toBe(true);
    // Recorded provenance so we can trace what wrote what (§41).
    expect(items.every((i) => i.promptVersion && i.generatedBy)).toBe(true);

    // Instagram first: nothing is drafted for a platform that isn't connected.
    expect(items.every((i) => i.platform === "instagram")).toBe(true);
    const types = new Set(items.map((i) => i.contentType));
    expect(types.has("POST")).toBe(true);
    expect(types.has("STORY")).toBe(true);
  });

  it("never introduces a price the owner didn't state", async () => {
    const items = await db.contentItem.findMany({ where: { campaignId, tenantId } });
    for (const item of items) {
      for (const amount of item.body.match(/₹[\d,]+/g) ?? []) {
        expect(amount).toBe("₹199");
      }
    }
  });

  it("holds the campaign for approval instead of publishing it", async () => {
    const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.status).toBe("PROPOSED");
    const published = await db.contentItem.count({ where: { campaignId, status: "PUBLISHED" } });
    expect(published).toBe(0);
  });

  it("on approval, keeps promotions behind a second check as configured", async () => {
    const result = await approveCampaign({ tenantId, userId, campaignId });

    const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.status).toBe("ACTIVE");
    // requireApprovalForPromotions is on, so items wait at APPROVED, not SCHEDULED.
    expect(result.awaitingApproval).toBeGreaterThan(0);
    const items = await db.contentItem.findMany({ where: { campaignId } });
    expect(items.every((i) => i.status === "APPROVED")).toBe(true);
  });

  it("writes an audit trail for the campaign lifecycle", async () => {
    const actions = await db.auditLog.findMany({ where: { tenantId } });
    const names = actions.map((a) => a.action);
    expect(names).toContain("campaign.generate");
    expect(names).toContain("campaign.approve");
  });

  it("asks a question rather than guessing when the price is missing", async () => {
    const result = await submitIdea({
      tenantId,
      userId,
      text: "We're doing a special combo this weekend",
    });
    expect(result.campaignId).toBeUndefined();
    expect(result.missingInfo.length).toBeGreaterThan(0);
    expect(result.idea.status).toBe("NEEDS_INFO");
  });

  it("plans a month of marketing and puts it on the calendar", async () => {
    const strategyId = await generateMonthlyStrategy({ tenantId, userId, month: monthKey() });
    const strategy = await db.marketingStrategy.findUniqueOrThrow({ where: { id: strategyId } });
    expect(strategy.status).toBe("ACTIVE");

    const planned = await db.contentItem.findMany({ where: { tenantId, strategyId } });
    expect(planned.length).toBeGreaterThan(4);
    expect(planned.every((i) => i.scheduledAt !== null)).toBe(true);
    // Everything lands inside the month it was planned for.
    expect(planned.every((i) => i.scheduledAt!.toISOString().slice(0, 7) === monthKey())).toBe(true);
  });
});
