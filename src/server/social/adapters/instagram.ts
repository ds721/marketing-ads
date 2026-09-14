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
      throw new Error("Instagram needs an image. Add a photo or flyer to this post first.");
    }

    const container = await graphPost(`/${input.accountId}/media`, {
      image_url: input.mediaUrl,
      caption: input.text,
      access_token: input.accessToken,
    });
    const creationId = String(container.id ?? "");
    if (!creationId) throw new Error("Instagram didn't accept the image. It has not been published.");

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
