"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireTenant, assertTenantOwns } from "@/server/tenant";
import { getAdapter } from "@/server/social";
import { audit } from "@/server/audit";
import { checkEntitlement } from "@/server/usage";
import { UsageLimitError } from "@/server/usage";
import { enqueue } from "@/server/jobs/queue";
import type { FormState } from "@/server/actions/auth";

/**
 * Starts the OAuth handshake for a platform. We never take a password — and
 * when the deployment has no approved app for that platform, we say so
 * instead of opening a flow that can't complete (§21).
 */
export async function beginConnectAction(slug: string, provider: string): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");
  const adapter = getAdapter(provider);

  if (!adapter.isConfigured()) {
    return {
      error: `${adapter.name} isn't available on this deployment yet. It needs an approved ${adapter.name} app — ask your administrator to add the credentials.`,
    };
  }

  try {
    await checkEntitlement(ctx.tenant.id, "connected_accounts");
  } catch (err) {
    if (err instanceof UsageLimitError) {
      return { error: "You've connected all the accounts your plan allows. Upgrade to add more." };
    }
    throw err;
  }

  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "social.connect_start",
    meta: { provider },
  });

  // The provider's OAuth redirect is issued by /api/social/[provider]/start
  // once the platform app credentials are present.
  return { ok: true, message: `Redirecting you to ${adapter.name}…` };
}

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
