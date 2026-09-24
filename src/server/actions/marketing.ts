"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireTenant, assertTenantOwns } from "@/server/tenant";
import { submitIdea, generateCampaignForIdea } from "@/server/marketing/ideas";
import { approveCampaign, rejectCampaign } from "@/server/marketing/campaigns";
import { generateMonthlyStrategy } from "@/server/marketing/strategy";
import { writeContentItem } from "@/server/marketing/content";
import { UsageLimitError } from "@/server/usage";
import { AiNotConfiguredError, AiOutputInvalidError, AiQuotaError } from "@/server/ai/types";
import { audit } from "@/server/audit";
import { log } from "@/server/logger";
import { monthKey } from "@/lib/utils";
import { designSpecSchema, type DesignSpec } from "@/server/ai/schemas";
import type { Prisma } from "@prisma/client";
import type { FormState } from "@/server/actions/auth";

/** Never show a raw stack trace or provider error code to a business owner (§49). */
function friendly(err: unknown, operation: string, tenantId?: string): string {
  if (err instanceof UsageLimitError) {
    return `You've used all your ${err.metric.replace(/_/g, " ")} for this month on your current plan. Upgrade to keep going.`;
  }
  if (err instanceof AiNotConfiguredError) {
    return "The AI isn't connected yet. Add an OpenAI API key in your environment settings to generate real marketing.";
  }
  if (err instanceof AiQuotaError) {
    return err.reason === "no_credit"
      ? "The AI account is out of credit. Whoever runs this platform needs to top up at platform.openai.com → Billing — nothing to fix on your side."
      : "The AI is busy right now. Give it a minute and try again.";
  }
  if (err instanceof AiOutputInvalidError) {
    return "The AI returned something we couldn't use. Try again — if it keeps happening, rephrase your idea.";
  }
  log.error({
    operation,
    tenantId,
    status: "error",
    error: err instanceof Error ? err.message : String(err),
  });
  return "Something went wrong on our side. Try again in a moment.";
}

// ── New marketing idea (§13, §45) ─────────────────────────────────────────

const ideaSchema = z.object({
  text: z.string().min(3, "Tell us a little more about what's happening.").max(2000),
});

export async function submitIdeaAction(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const parsed = ideaSchema.safeParse({ text: formData.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  // Creative choices from the studio. A photo id is only honoured if it's ours;
  // a design spec only if it validates — the client can't smuggle markup in.
  const templateId = String(formData.get("template") ?? "") || null;
  let heroAssetId = String(formData.get("heroAssetId") ?? "") || null;
  if (heroAssetId) {
    const asset = await db.asset.findFirst({ where: { id: heroAssetId, tenantId: ctx.tenant.id }, select: { id: true } });
    if (!asset) heroAssetId = null;
  }
  const designSpec = parseDesignSpec(formData.get("designSpec"));

  let result;
  try {
    result = await submitIdea({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      text: parsed.data.text,
      templateId,
      heroAssetId,
      designSpec,
    });
  } catch (err) {
    return { error: friendly(err, "idea.submit", ctx.tenant.id) };
  }

  if (result.missingInfo.length > 0) {
    redirect(`/app/${slug}/ideas/${result.idea.id}`);
  }
  redirect(`/app/${slug}/campaigns/${result.campaignId}`);
}

/** The owner answers the AI's question; we then build the campaign. */
export async function answerIdeaAction(
  slug: string,
  ideaId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const idea = await db.idea.findUnique({ where: { id: ideaId } });
  assertTenantOwns(ctx, idea);

  const answer = String(formData.get("answer") ?? "").trim();
  if (answer.length < 1) return { error: "Add the detail so we can finish the campaign." };

  let result;
  try {
    result = await submitIdea({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      text: idea.text,
      extraDetail: answer,
    });
  } catch (err) {
    return { error: friendly(err, "idea.answer", ctx.tenant.id) };
  }

  if (result.missingInfo.length > 0) redirect(`/app/${slug}/ideas/${result.idea.id}`);
  redirect(`/app/${slug}/campaigns/${result.campaignId}`);
}

// ── Campaign review (§15) ─────────────────────────────────────────────────

export async function approveCampaignAction(slug: string, campaignId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  assertTenantOwns(ctx, campaign);

  await approveCampaign({ tenantId: ctx.tenant.id, userId: ctx.userId, campaignId });
  revalidatePath(`/app/${slug}/campaigns/${campaignId}`);
  revalidatePath(`/app/${slug}/calendar`);
  revalidatePath(`/app/${slug}/dashboard`);
}

export async function rejectCampaignAction(slug: string, campaignId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  assertTenantOwns(ctx, campaign);

  await rejectCampaign({ tenantId: ctx.tenant.id, userId: ctx.userId, campaignId });
  redirect(`/app/${slug}/campaigns`);
}

export async function regenerateCampaignAction(
  slug: string,
  campaignId: string,
  _prev: FormState,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { idea: true },
  });
  assertTenantOwns(ctx, campaign);
  if (!campaign.idea) return { error: "This campaign has no original idea to rebuild from." };

  try {
    // Archive the old proposal, then build a fresh one from the same idea.
    await db.$transaction([
      db.contentItem.updateMany({
        where: { campaignId: campaign.id, tenantId: ctx.tenant.id },
        data: { status: "ARCHIVED" },
      }),
      db.campaign.update({ where: { id: campaign.id }, data: { status: "ARCHIVED" } }),
      db.idea.update({ where: { id: campaign.idea.id }, data: { campaignId: null } }),
    ]);

    const newId = await generateCampaignForIdea({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      idea: campaign.idea,
      ideaText: campaign.idea.text,
      facts: (campaign.facts as Record<string, string | null>) ?? {},
    });
    redirect(`/app/${slug}/campaigns/${newId}`);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // redirect
    return { error: friendly(err, "campaign.regenerate", ctx.tenant.id) };
  }
}

// ── Content review (§22) ──────────────────────────────────────────────────

export async function approveContentAction(slug: string, contentId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const item = await db.contentItem.findUnique({ where: { id: contentId } });
  assertTenantOwns(ctx, item);

  const automation = await db.automationSettings.findUnique({ where: { tenantId: ctx.tenant.id } });
  const next = automation?.autoSchedule && !automation.paused && item.scheduledAt ? "SCHEDULED" : "APPROVED";

  await db.contentItem.update({ where: { id: item.id }, data: { status: next } });
  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "content.approve",
    targetType: "content",
    targetId: item.id,
  });
  revalidatePath(`/app/${slug}/calendar`);
  revalidatePath(`/app/${slug}/dashboard`);
}

export async function updateContentAction(
  slug: string,
  contentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const item = await db.contentItem.findUnique({ where: { id: contentId } });
  assertTenantOwns(ctx, item);

  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!body || !title) return { error: "Title and text can't be empty." };

  await db.contentItem.update({
    where: { id: item.id },
    data: { title: title.slice(0, 160), body: body.slice(0, 3000) },
  });
  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "content.edit",
    targetType: "content",
    targetId: item.id,
  });
  revalidatePath(`/app/${slug}/calendar`);
  return { ok: true, message: "Saved." };
}

export async function generateContentCopyAction(slug: string, contentId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const item = await db.contentItem.findUnique({ where: { id: contentId } });
  assertTenantOwns(ctx, item);
  await writeContentItem({ tenantId: ctx.tenant.id, userId: ctx.userId, contentItemId: item.id });
  revalidatePath(`/app/${slug}/calendar`);
}

// ── Strategy (§10) ────────────────────────────────────────────────────────

export async function generateStrategyAction(slug: string, _prev: FormState): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");
  try {
    await generateMonthlyStrategy({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      month: monthKey(),
    });
  } catch (err) {
    return { error: friendly(err, "strategy.generate", ctx.tenant.id) };
  }
  revalidatePath(`/app/${slug}/calendar`);
  revalidatePath(`/app/${slug}/dashboard`);
  return { ok: true, message: "Your plan for this month is ready." };
}

// ── Insights (§25) ────────────────────────────────────────────────────────

export async function generateInsightsAction(slug: string, _prev: FormState): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");
  try {
    const { generateInsights } = await import("@/server/marketing/insights");
    const count = await generateInsights({ tenantId: ctx.tenant.id, userId: ctx.userId });
    if (count === 0) {
      return { error: "There aren't enough published results to analyse yet. Publish a few posts first." };
    }
  } catch (err) {
    return { error: friendly(err, "insights.generate", ctx.tenant.id) };
  }
  revalidatePath(`/app/${slug}/analytics`);
  revalidatePath(`/app/${slug}/dashboard`);
  return { ok: true, message: "Here's what I found." };
}

// ── Short video (§12) ─────────────────────────────────────────────────────

export async function generateVideoScriptAction(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");

  const topic = String(formData.get("topic") ?? "").trim();
  if (topic.length < 3) return { error: "Tell us what the video should be about." };

  const format = String(formData.get("format") ?? "reel");
  if (!["reel", "story", "short"].includes(format)) return { error: "Pick a video format." };
  const durationSec = Math.min(90, Math.max(5, Number(formData.get("durationSec") ?? 15)));

  try {
    const { generateVideoScript } = await import("@/server/marketing/video");
    await generateVideoScript({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      topic,
      format: format as "reel" | "story" | "short",
      durationSec,
    });
  } catch (err) {
    return { error: friendly(err, "video.script_generate", ctx.tenant.id) };
  }

  revalidatePath(`/app/${slug}/videos`);
  revalidatePath(`/app/${slug}/calendar`);
  return { ok: true, message: "Your video plan is ready." };
}

export async function generateVideoForContentAction(slug: string, contentId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const item = await db.contentItem.findUnique({ where: { id: contentId } });
  assertTenantOwns(ctx, item);

  const { generateVideoScript } = await import("@/server/marketing/video");
  await generateVideoScript({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    topic: item.title,
    campaignId: item.campaignId,
    contentItemId: item.id,
  });
  revalidatePath(`/app/${slug}/calendar`);
}

// ── Post page: image + publish (§22) ──────────────────────────────────────

export async function attachAssetAction(slug: string, contentId: string, assetId: string | null): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const item = await db.contentItem.findUnique({ where: { id: contentId } });
  assertTenantOwns(ctx, item);

  if (assetId) {
    const asset = await db.asset.findUnique({ where: { id: assetId } });
    assertTenantOwns(ctx, asset);
    // A video makes this post a Reel when it publishes.
  }

  await db.contentItem.update({ where: { id: item.id }, data: { assetId } });
  revalidatePath(`/app/${slug}/content/${item.id}`);
  return { ok: true };
}

/**
 * Publishes one post right now, in the request, and reports what happened.
 * The owner sees the result — not a promise that a background job will get
 * to it eventually.
 */
export async function publishNowAction(slug: string, contentId: string): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const item = await db.contentItem.findUnique({ where: { id: contentId } });
  assertTenantOwns(ctx, item);

  if (item.status === "PUBLISHED") return { error: "This post is already live." };
  if (item.platform === "instagram" && !item.assetId) {
    return { error: "Instagram needs a photo or video. Pick one below first." };
  }
  const connected = await db.socialAccount.findFirst({
    where: { tenantId: ctx.tenant.id, provider: item.platform, status: "CONNECTED" },
  });
  if (!connected) {
    return { error: `${item.platform.replace("_", " ")} isn't connected yet. Connect it on the Instagram page.` };
  }

  await db.contentItem.update({ where: { id: item.id }, data: { status: "SCHEDULED" } });
  await audit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "content.publish_now", targetType: "content", targetId: item.id });

  const { enqueue } = await import("@/server/jobs/queue");
  const { tick } = await import("@/server/jobs/worker");
  await enqueue({ type: "publish_content", tenantId: ctx.tenant.id, payload: { contentItemId: item.id }, maxAttempts: 1 });
  await tick(5);

  const after = await db.contentItem.findUniqueOrThrow({ where: { id: item.id } });
  revalidatePath(`/app/${slug}/content/${item.id}`);
  revalidatePath(`/app/${slug}/calendar`);
  revalidatePath(`/app/${slug}/dashboard`);

  if (after.status === "PUBLISHED") return { ok: true, message: "It's live on Instagram." };
  if (after.status === "FAILED") return { error: after.failureReason ?? "Instagram didn't accept the post." };
  return { ok: true, message: "Publishing — refresh in a moment." };
}


function parseDesignSpec(raw: FormDataEntryValue | null): DesignSpec | null {
  if (!raw) return null;
  try {
    const parsed = designSpecSchema.safeParse(JSON.parse(String(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── AI design directions (§18) ────────────────────────────────────────────

export type DesignOptionDto = { spec: DesignSpec; preview: string };

export async function designIdeasAction(
  slug: string,
  input: { headline: string; price?: string | null; when?: string | null; heroAssetId?: string | null },
): Promise<{ designs?: DesignOptionDto[]; error?: string }> {
  const ctx = await requireTenant(slug, "EDITOR");
  const headline = input.headline.trim().slice(0, 160);
  if (headline.length < 2) return { error: "Type what you're promoting first." };
  try {
    const { generateDesigns } = await import("@/server/marketing/designs");
    const designs = await generateDesigns({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      headline,
      price: input.price ?? null,
      when: input.when ?? null,
      heroAssetId: input.heroAssetId ?? null,
    });
    return { designs };
  } catch (err) {
    return { error: friendly(err, "design.generate", ctx.tenant.id) };
  }
}

// ── Change the look of an existing campaign ───────────────────────────────

export async function changeLookAction(
  slug: string,
  campaignId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  assertTenantOwns(ctx, campaign);

  const templateId = String(formData.get("template") ?? "") || null;
  let heroAssetId = String(formData.get("heroAssetId") ?? "") || null;
  if (heroAssetId) {
    const asset = await db.asset.findFirst({ where: { id: heroAssetId, tenantId: ctx.tenant.id }, select: { id: true } });
    if (!asset) heroAssetId = null;
  }
  const designSpec = parseDesignSpec(formData.get("designSpec"));

  await db.campaign.update({
    where: { id: campaign.id },
    data: { templateId, heroAssetId, designSpec: (designSpec ?? undefined) as Prisma.InputJsonValue | undefined },
  });
  // Detach the old flyers (published posts keep theirs) and redraw.
  await db.contentItem.updateMany({
    where: { tenantId: ctx.tenant.id, campaignId: campaign.id, platform: "instagram", status: { not: "PUBLISHED" } },
    data: { assetId: null },
  });
  const { createCampaignFlyers } = await import("@/server/creative/campaign-flyer");
  await createCampaignFlyers({ tenantId: ctx.tenant.id, campaignId: campaign.id, userId: ctx.userId });

  await audit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "campaign.change_look", targetType: "campaign", targetId: campaign.id, meta: { templateId, heroAssetId } });
  revalidatePath(`/app/${slug}/campaigns/${campaign.id}`);
  return { ok: true, message: "Redrawn." };
}


// ── Reels from the video library ──────────────────────────────────────────

/** Turns a library video into a ready-to-post Reel item and opens it. */
export async function createReelFromVideoAction(slug: string, assetId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  assertTenantOwns(ctx, asset);
  if (asset.kind !== "VIDEO") throw new Error("Only videos can become Reels.");

  const when = new Date();
  when.setHours(when.getHours() + 1, 0, 0, 0);
  const item = await db.contentItem.create({
    data: {
      tenantId: ctx.tenant.id,
      platform: "instagram",
      contentType: "REEL",
      title: asset.filename.replace(/\.[a-z0-9]+$/i, "").replace(/^Branded — /, ""),
      body: "",
      assetId: asset.id,
      scheduledAt: when,
      status: "DRAFT",
    },
  });
  await audit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "content.reel_from_video", targetType: "content", targetId: item.id });
  redirect(`/app/${slug}/content/${item.id}`);
}

// ── Removing things ───────────────────────────────────────────────────────
// An owner who can add a post must be able to take it away again. One honest
// caveat runs through all of this: Instagram's publishing API can create
// media but cannot delete it, so removing a published post here removes it
// from Markit only. We say so plainly rather than implying we reached into
// their feed.

export async function deleteContentAction(slug: string, contentId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const item = await db.contentItem.findUnique({
    where: { id: contentId },
    select: { id: true, tenantId: true, title: true, status: true, campaignId: true },
  });
  assertTenantOwns(ctx, item);

  // SocialPost rows cascade from the content item; the flyer asset is left
  // alone because the owner may have reused it elsewhere.
  await db.contentItem.delete({ where: { id: item.id } });
  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "content.delete",
    targetType: "content_item",
    targetId: item.id,
    meta: { title: item.title, status: item.status },
  });

  for (const path of ["calendar", "campaigns", "dashboard"]) {
    revalidatePath(`/app/${slug}/${path}`);
  }
  if (item.campaignId) revalidatePath(`/app/${slug}/campaigns/${item.campaignId}`);
  redirect(`/app/${slug}/calendar`);
}

export async function deleteCampaignAction(slug: string, campaignId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, tenantId: true, name: true },
  });
  assertTenantOwns(ctx, campaign);

  // ContentItem.campaignId is SetNull, which would leave orphaned posts on the
  // calendar with no way back to their campaign. Remove them with it.
  const removed = await db.$transaction(async (tx) => {
    const { count } = await tx.contentItem.deleteMany({
      where: { tenantId: ctx.tenant.id, campaignId: campaign.id },
    });
    await tx.campaign.delete({ where: { id: campaign.id } });
    return count;
  });

  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "campaign.delete",
    targetType: "campaign",
    targetId: campaign.id,
    meta: { name: campaign.name, contentItemsRemoved: removed },
  });

  for (const path of ["calendar", "campaigns", "dashboard"]) {
    revalidatePath(`/app/${slug}/${path}`);
  }
  redirect(`/app/${slug}/campaigns`);
}
