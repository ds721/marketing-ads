import { db } from "@/server/db";
import { audit } from "@/server/audit";
import type { AutomationSettings } from "@prisma/client";

// ── Campaign approval & calendar replanning (§16, §22) ────────────────────

/**
 * Approving a campaign moves its content into the calendar. What happens next
 * depends on the tenant's automation level — never silently more than the
 * owner allowed (§22–23).
 */
export async function approveCampaign(params: {
  tenantId: string;
  userId: string;
  campaignId: string;
}): Promise<{ scheduled: number; awaitingApproval: number }> {
  const { tenantId, userId, campaignId } = params;

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { contentItems: true },
  });
  if (!campaign) throw new Error("Campaign not found.");

  const automation = await db.automationSettings.findUnique({ where: { tenantId } });
  const canAutoSchedule = automation?.autoSchedule && !automation.paused;
  const isPromotion = ["PROMOTION", "DISCOUNT", "SEASONAL_CAMPAIGN", "INVENTORY_PROMOTION"].includes(
    campaign.category,
  );
  const needsItemApproval = automation?.requireApprovalForPromotions && isPromotion;

  const targetStatus = canAutoSchedule && !needsItemApproval ? "SCHEDULED" : "APPROVED";

  await db.$transaction([
    db.campaign.update({
      where: { id: campaign.id },
      data: { status: "ACTIVE" },
    }),
    db.contentItem.updateMany({
      where: { campaignId: campaign.id, tenantId, status: { in: ["NEEDS_REVIEW", "AI_GENERATED", "DRAFT"] } },
      data: { status: targetStatus },
    }),
    db.idea.updateMany({
      where: { campaignId: campaign.id, tenantId },
      data: { status: "ACCEPTED" },
    }),
  ]);

  await audit({
    tenantId,
    userId,
    action: "campaign.approve",
    targetType: "campaign",
    targetId: campaign.id,
    meta: { items: campaign.contentItems.length, targetStatus },
  });

  await replanAroundCampaign({ tenantId, campaignId: campaign.id, automation });

  return {
    scheduled: targetStatus === "SCHEDULED" ? campaign.contentItems.length : 0,
    awaitingApproval: targetStatus === "APPROVED" ? campaign.contentItems.length : 0,
  };
}

export async function rejectCampaign(params: {
  tenantId: string;
  userId: string;
  campaignId: string;
}): Promise<void> {
  const { tenantId, userId, campaignId } = params;
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!campaign) throw new Error("Campaign not found.");

  await db.$transaction([
    db.campaign.update({ where: { id: campaign.id }, data: { status: "REJECTED" } }),
    db.contentItem.updateMany({
      where: { campaignId: campaign.id, tenantId },
      data: { status: "ARCHIVED" },
    }),
    db.idea.updateMany({ where: { campaignId: campaign.id, tenantId }, data: { status: "REJECTED" } }),
  ]);

  await audit({ tenantId, userId, action: "campaign.reject", targetType: "campaign", targetId: campaign.id });
}

/**
 * Calendar replanning (§16): a new campaign must not turn the week into spam.
 * Where campaign posts collide with routine strategy posts, the routine post
 * is pushed out rather than stacked — and the weekly cap is respected.
 */
async function replanAroundCampaign(params: {
  tenantId: string;
  campaignId: string;
  automation: AutomationSettings | null;
}): Promise<void> {
  const { tenantId, campaignId, automation } = params;
  if (automation && !automation.aiReplanning) return;

  const campaignItems = await db.contentItem.findMany({
    where: { tenantId, campaignId, scheduledAt: { not: null } },
    select: { scheduledAt: true },
  });
  if (campaignItems.length === 0) return;

  const dates = campaignItems.map((i) => i.scheduledAt!).sort((a, b) => a.getTime() - b.getTime());
  const from = new Date(dates[0]!);
  from.setHours(0, 0, 0, 0);
  const to = new Date(dates[dates.length - 1]!);
  to.setHours(23, 59, 59, 999);

  const busyDays = new Set(dates.map((d) => d.toDateString()));

  // Routine (non-campaign) drafts that now collide with the campaign.
  const colliding = await db.contentItem.findMany({
    where: {
      tenantId,
      campaignId: null,
      status: { in: ["DRAFT", "NEEDS_REVIEW", "APPROVED"] },
      scheduledAt: { gte: from, lte: to },
    },
    orderBy: { scheduledAt: "asc" },
  });

  for (const item of colliding) {
    if (!item.scheduledAt || !busyDays.has(item.scheduledAt.toDateString())) continue;
    // Push to the first free day after the campaign window.
    const moved = new Date(to);
    let guard = 0;
    do {
      moved.setDate(moved.getDate() + 1);
      guard++;
    } while (busyDays.has(moved.toDateString()) && guard < 14);
    moved.setHours(item.scheduledAt.getHours(), item.scheduledAt.getMinutes(), 0, 0);
    busyDays.add(moved.toDateString());

    await db.contentItem.update({
      where: { id: item.id },
      data: { scheduledAt: moved },
    });
  }

  if (colliding.length > 0) {
    await audit({
      tenantId,
      action: "calendar.replan",
      targetType: "campaign",
      targetId: campaignId,
      meta: { moved: colliding.length },
    });
  }
}
