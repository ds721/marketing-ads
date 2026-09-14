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
import { AiNotConfiguredError, AiOutputInvalidError } from "@/server/ai/types";
import { audit } from "@/server/audit";
import { log } from "@/server/logger";
import { monthKey } from "@/lib/utils";
import type { FormState } from "@/server/actions/auth";

/** Never show a raw stack trace or provider error code to a business owner (§49). */
function friendly(err: unknown, operation: string, tenantId?: string): string {
  if (err instanceof UsageLimitError) {
    return `You've used all your ${err.metric.replace(/_/g, " ")} for this month on your current plan. Upgrade to keep going.`;
  }
  if (err instanceof AiNotConfiguredError) {
    return "The AI isn't connected yet. Add an OpenAI API key in your environment settings to generate real marketing.";
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

  let result;
  try {
    result = await submitIdea({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      text: parsed.data.text,
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
