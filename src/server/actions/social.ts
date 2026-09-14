"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireTenant, assertTenantOwns } from "@/server/tenant";
import { audit } from "@/server/audit";
import { enqueue } from "@/server/jobs/queue";
import type { FormState } from "@/server/actions/auth";

export async function disconnectAccountAction(slug: string, accountId: string): Promise<void> {
  const ctx = await requireTenant(slug, "ADMIN");
  const account = await db.socialAccount.findUnique({ where: { id: accountId } });
  assertTenantOwns(ctx, account);

  await db.socialAccount.update({
    where: { id: account.id },
    data: { status: "DISCONNECTED" },
  });
  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "social.disconnect",
    targetType: "social_account",
    targetId: account.id,
    meta: { provider: account.provider },
  });
  revalidatePath(`/app/${slug}/integrations`);
}

/** Schedules an approved item and queues the publish job. */
export async function scheduleContentAction(slug: string, contentId: string): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const item = await db.contentItem.findUnique({ where: { id: contentId } });
  assertTenantOwns(ctx, item);

  if (item.status !== "APPROVED") {
    return { error: "Approve this post first." };
  }
  const connected = await db.socialAccount.findFirst({
    where: { tenantId: ctx.tenant.id, provider: item.platform, status: "CONNECTED" },
  });
  if (!connected) {
    return {
      error: `${item.platform.replace("_", " ")} isn't connected, so this can't be scheduled yet. Connect it on the Integrations page.`,
    };
  }

  await db.contentItem.update({ where: { id: item.id }, data: { status: "SCHEDULED" } });
  await enqueue({
    type: "publish_content",
    tenantId: ctx.tenant.id,
    payload: { contentItemId: item.id },
    runAt: item.scheduledAt ?? new Date(),
  });

  revalidatePath(`/app/${slug}/calendar`);
  return { ok: true, message: "Scheduled." };
}

// ── Automation settings (§23) ─────────────────────────────────────────────

export async function saveAutomationAction(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");

  const level = String(formData.get("level") ?? "MANUAL");
  if (!["MANUAL", "ASSISTED", "AUTOMATED"].includes(level)) {
    return { error: "Pick an automation level." };
  }
  const maxPosts = Math.min(21, Math.max(1, Number(formData.get("maxPostsPerWeek") ?? 5)));
  const quietStart = formData.get("quietHoursStart");
  const quietEnd = formData.get("quietHoursEnd");

  await db.automationSettings.update({
    where: { tenantId: ctx.tenant.id },
    data: {
      level: level as "MANUAL" | "ASSISTED" | "AUTOMATED",
      // Only the "Automated" level may ever publish without a person looking.
      autoSchedule: level !== "MANUAL",
      autoPublish: level === "AUTOMATED",
      aiReplanning: formData.get("aiReplanning") === "on",
      requireApprovalForPromotions: formData.get("requireApprovalForPromotions") === "on",
      maxPostsPerWeek: maxPosts,
      quietHoursStart: quietStart ? Number(quietStart) : null,
      quietHoursEnd: quietEnd ? Number(quietEnd) : null,
      paused: formData.get("paused") === "on",
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "automation.update",
    meta: { level, maxPosts },
  });
  revalidatePath(`/app/${slug}/settings`);
  return { ok: true, message: "Saved." };
}
