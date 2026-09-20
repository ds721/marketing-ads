// ── Platform adapters (§55) ───────────────────────────────────────────────
// The marketing engine is platform-independent. Adapters translate a finished
// ContentItem into one platform's API call. Adding TikTok or Ads means adding
// an adapter here — the strategy layer never changes.

export interface PublishInput {
  contentItemId: string;
  /** Feed post or 24-hour story. */
  kind: "POST" | "STORY";
  text: string;
  /** Publicly reachable media URL, when the platform requires one. */
  mediaUrl?: string | null;
  accessToken: string;
  accountId: string;
}

export interface PublishResult {
  externalId: string;
  url?: string;
}

export class PlatformNotConfiguredError extends Error {
  constructor(public provider: string) {
    super(`${provider} is not connected yet.`);
    this.name = "PlatformNotConfiguredError";
  }
}

export class PlatformAuthError extends Error {
  constructor(public provider: string) {
    // The message a business owner should see — never "API Error 190" (§49).
    super(`Your ${provider} connection needs to be reconnected.`);
    this.name = "PlatformAuthError";
  }
}

export interface PlatformAdapter {
  readonly id: string;
  readonly name: string;
  /** OAuth app credentials present in env — not the same as a tenant connection. */
  isConfigured(): boolean;
  publish(input: PublishInput): Promise<PublishResult>;
}
