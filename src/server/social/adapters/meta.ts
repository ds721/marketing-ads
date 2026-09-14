import {
  PlatformAuthError,
  PlatformNotConfiguredError,
  type PlatformAdapter,
  type PublishInput,
  type PublishResult,
} from "@/server/social/types";
import { log } from "@/server/logger";
import { isMetaConfigured } from "@/server/social/meta-oauth";

// Meta Graph API adapter for Instagram and Facebook Pages.
// Requires an approved Meta app (META_APP_ID / META_APP_SECRET) plus a tenant
// connection. Without both it refuses to run — it never reports a fake success.

const GRAPH = "https://graph.facebook.com/v21.0";
const TIMEOUT_MS = 30_000;

async function graphPost(
  path: string,
  body: Record<string, string>,
  provider: string,
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
      error?: { code?: number; message?: string };
    };

    if (!res.ok || json.error) {
      const code = json.error?.code;
      // 190 = invalid/expired token, 102 = session expired.
      if (code === 190 || code === 102) throw new PlatformAuthError(provider);
      log.error({
        operation: "social.publish",
        provider,
        status: "error",
        error: `graph_error_${code ?? res.status}`,
      });
      throw new Error(`${provider} rejected the post. It has not been published.`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

class MetaAdapter implements PlatformAdapter {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  isConfigured(): boolean {
    return isMetaConfigured();
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError(this.name);

    if (this.id === "instagram") {
      // Instagram requires an image and a two-step container → publish flow.
      if (!input.mediaUrl) {
        throw new Error("Instagram needs an image or video. Add one to this post first.");
      }
      const container = await graphPost(
        `/${input.accountId}/media`,
        { image_url: input.mediaUrl, caption: input.text, access_token: input.accessToken },
        this.name,
      );
      const creationId = String(container.id ?? "");
      const published = await graphPost(
        `/${input.accountId}/media_publish`,
        { creation_id: creationId, access_token: input.accessToken },
        this.name,
      );
      return { externalId: String(published.id ?? creationId) };
    }

    const result = await graphPost(
      `/${input.accountId}/feed`,
      {
        message: input.text,
        ...(input.mediaUrl ? { link: input.mediaUrl } : {}),
        access_token: input.accessToken,
      },
      this.name,
    );
    return { externalId: String(result.id ?? "") };
  }
}

export const instagramAdapter = new MetaAdapter("instagram", "Instagram");
export const facebookAdapter = new MetaAdapter("facebook", "Facebook");
