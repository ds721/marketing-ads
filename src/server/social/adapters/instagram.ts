import {
  PlatformAuthError,
  PlatformNotConfiguredError,
  type PlatformAdapter,
  type PublishInput,
  type PublishResult,
} from "@/server/social/types";
import { isInstagramConfigured } from "@/server/social/instagram-oauth";
import { log } from "@/server/logger";

// Instagram Graph API via Instagram Login. Publishing is a two-step flow:
// create a media container from a public image URL, then publish it.
// Never reports success unless Instagram returns a media id.

const GRAPH = "https://graph.instagram.com/v21.0";
const TIMEOUT_MS = 30_000;
const CONTAINER_POLL_MS = 2_000;
const CONTAINER_MAX_WAIT_MS = 60_000;
const REEL_MAX_WAIT_MS = 5 * 60_000; // video transcoding takes longer

async function graphGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`, { signal: controller.signal });
    const json = (await res.json()) as Record<string, unknown> & { error?: { code?: number } };
    if (!res.ok || json.error) {
      if (json.error?.code === 190) throw new PlatformAuthError("Instagram");
      throw new Error("Instagram didn't report the post's status.");
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Instagram fetches and processes the image asynchronously. Publishing before
 * the container reports FINISHED fails with a "media not ready" error, so we
 * wait for it — and surface a real reason if Instagram rejects the image.
 */
async function waitForContainer(containerId: string, accessToken: string, maxWait = CONTAINER_MAX_WAIT_MS): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < maxWait) {
    const status = await graphGet(`/${containerId}`, {
      fields: "status_code,status",
      access_token: accessToken,
    });
    const code = String(status.status_code ?? "");
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      log.error({ operation: "social.publish", provider: "instagram", status: "error", error: `container_${code}`, detail: String(status.status ?? "") });
      throw new Error("Instagram couldn't use that media. Images: JPEG, square to 4:5. Reels: MP4, 9:16, up to 90 seconds.");
    }
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_MS));
  }
  throw new Error("Instagram is taking too long to process the image. We'll try again shortly.");
}

async function graphPost(
  path: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GRAPH}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: controller.signal,
    });
    const json = (await res.json()) as Record<string, unknown> & {
      error?: { code?: number; message?: string; error_subcode?: number };
    };

    if (!res.ok || json.error) {
      const code = json.error?.code;
      // 190 = invalid/expired token — needs a reconnect, not a retry.
      if (code === 190) throw new PlatformAuthError("Instagram");
      log.error({
        operation: "social.publish",
        provider: "instagram",
        status: "error",
        error: `graph_error_${code ?? res.status}`,
      });
      throw new Error("Instagram rejected the post. It has not been published.");
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

class InstagramAdapter implements PlatformAdapter {
  readonly id = "instagram";
  readonly name = "Instagram";

  isConfigured(): boolean {
    return isInstagramConfigured();
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError(this.name);
    if (!input.mediaUrl) {
      throw new Error("Instagram needs a photo or video. Add one to this post first.");
    }

    const isVideo = input.kind === "REEL";
    const container = await graphPost(`/${input.accountId}/media`, {
      access_token: input.accessToken,
      ...(isVideo
        ? { media_type: "REELS", video_url: input.mediaUrl, caption: input.text, share_to_feed: "true" }
        : input.kind === "STORY"
          ? { media_type: "STORIES", image_url: input.mediaUrl }
          : { image_url: input.mediaUrl, caption: input.text }),
    });
    const creationId = String(container.id ?? "");
    if (!creationId) throw new Error("Instagram didn't accept the media. It has not been published.");

    await waitForContainer(creationId, input.accessToken, isVideo ? REEL_MAX_WAIT_MS : CONTAINER_MAX_WAIT_MS);

    const published = await graphPost(`/${input.accountId}/media_publish`, {
      creation_id: creationId,
      access_token: input.accessToken,
    });
    const mediaId = String(published.id ?? "");
    if (!mediaId) throw new Error("Instagram didn't confirm the post. It has not been published.");

    return { externalId: mediaId };
  }
}

export const instagramAdapter = new InstagramAdapter();
