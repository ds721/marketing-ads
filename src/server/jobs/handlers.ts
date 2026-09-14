import { db } from "@/server/db";
import { decryptSecret } from "@/server/crypto";
import { getAdapter } from "@/server/social";
import { PlatformAuthError, PlatformNotConfiguredError } from "@/server/social/types";
import { recordUsage, checkEntitlement } from "@/server/usage";
import { log } from "@/server/logger";
import type { Job } from "@prisma/client";

// ── Job handlers (§35) ────────────────────────────────────────────────────

/**
 * Publish one approved content item. Failure states are explicit and visible:
 * nothing is ever marked PUBLISHED unless a platform returned an id.
 */
async function publishContent(job: Job): Promise<void> {
  const { contentItemId } = job.payload as { contentItemId: string };
  const item = await db.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) return; // deleted since scheduling — nothing to do

  if (item.status !== "SCHEDULED" && item.status !== "PUBLISHING") {
    log.info({ operation: "job.publish.skip", tenantId: item.tenantId, status: "ok", reason: item.status });
    return;
  }

  const account = await db.socialAccount.findFirst({
    where: { tenantId: item.tenantId, provider: item.platform, status: "CONNECTED" },
  });

  const failWith = async (reason: string, kind: string) => {
    await db.contentItem.update({
      where: { id: item.id },
      data: { status: "FAILED", failureReason: reason },
    });
    await db.notification.create({
      data: {
        tenantId: item.tenantId,
        kind,
        title: "A post couldn't go out",
        body: reason,
        href: `/app/_/calendar`,
      },
    });
  };

  if (!account) {
    await failWith(`${item.platform.replace("_", " ")} isn't connected. Reconnect it and we'll try again.`, "connection_expired");
    return;
  }

  await db.contentItem.update({ where: { id: item.id }, data: { status: "PUBLISHING" } });

  const post = await db.socialPost.create({
    data: {
      tenantId: item.tenantId,
      contentItemId: item.id,
      socialAccountId: account.id,
      status: "PUBLISHING",
    },
  });

  try {
    await checkEntitlement(item.tenantId, "posts_published");

    const adapter = getAdapter(item.platform);
    const caption = [item.hook, item.body, item.cta, item.hashtags.join(" ")]
      .filter(Boolean)
      .join("\n\n");

    const result = await adapter.publish({
      contentItemId: item.id,
      text: caption,
      mediaUrl: null,
      accessToken: decryptSecret(account.accessTokenEnc),
      accountId: account.accountId,
    });

    await db.$transaction([
      db.socialPost.update({
        where: { id: post.id },
        data: { status: "PUBLISHED", externalId: result.externalId, publishedAt: new Date() },
      }),
      db.contentItem.update({
        where: { id: item.id },
        data: { status: "PUBLISHED", publishedAt: new Date(), failureReason: null },
      }),
      db.socialAccount.update({
        where: { id: account.id },
        data: { lastPublishedAt: new Date() },
      }),
      db.notification.create({
        data: {
          tenantId: item.tenantId,
          kind: "published",
          title: "Your post is live",
          body: item.title,
        },
      }),
    ]);

    await recordUsage(item.tenantId, "posts_published");
  } catch (err) {
    const authProblem = err instanceof PlatformAuthError;
    if (authProblem) {
      await db.socialAccount.update({ where: { id: account.id }, data: { status: "EXPIRED" } });
    }

    const message =
      err instanceof PlatformAuthError || err instanceof PlatformNotConfiguredError
        ? err.message
        : "We couldn't publish this post. We'll try again shortly.";

    await db.socialPost.update({
      where: { id: post.id },
      data: { status: "FAILED", error: message },
    });
    await failWith(message, authProblem ? "connection_expired" : "publish_failed");

    // Auth and configuration problems won't fix themselves on retry.
    if (authProblem || err instanceof PlatformNotConfiguredError) return;
    throw err;
  }
}

/** Flags connections nearing expiry so the owner can reconnect before a post fails. */
async function refreshTokens(): Promise<void> {
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const expiring = await db.socialAccount.findMany({
    where: { status: "CONNECTED", expiresAt: { not: null, lte: soon } },
  });

  for (const account of expiring) {
    await db.socialAccount.update({ where: { id: account.id }, data: { status: "EXPIRED" } });
    await db.notification.create({
      data: {
        tenantId: account.tenantId,
        kind: "connection_expired",
        title: `Reconnect ${account.provider.replace("_", " ")}`,
        body: "Your connection is about to expire. Reconnect it so scheduled posts keep going out.",
        href: `/app/_/integrations`,
      },
    });
  }
}

export async function runJob(job: Job): Promise<void> {
  switch (job.type) {
    case "publish_content":
      return publishContent(job);
    case "refresh_tokens":
      return refreshTokens();
    case "collect_analytics":
      // Real collection needs a connected platform; nothing to do until then.
      return;
    default:
      log.error({ operation: "job.unknown", status: "error", error: job.type });
  }
}
