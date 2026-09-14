import { instagramAdapter, facebookAdapter } from "@/server/social/adapters/meta";
import { PlatformNotConfiguredError, type PlatformAdapter } from "@/server/social/types";

// Platforms the product knows about. Those without an adapter yet are listed
// so the integrations page can show an honest "not available yet" state
// rather than a Connect button that goes nowhere.

class UnavailableAdapter implements PlatformAdapter {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {}
  isConfigured() {
    return false;
  }
  async publish(): Promise<never> {
    throw new PlatformNotConfiguredError(this.name);
  }
}

export const ADAPTERS: Record<string, PlatformAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  whatsapp: new UnavailableAdapter("whatsapp", "WhatsApp"),
  google_business: new UnavailableAdapter("google_business", "Google Business"),
  linkedin: new UnavailableAdapter("linkedin", "LinkedIn"),
};

export function getAdapter(provider: string): PlatformAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new PlatformNotConfiguredError(provider);
  return adapter;
}

export interface PlatformStatus {
  id: string;
  name: string;
  /** A real adapter exists — the product can publish here once configured. */
  supported: boolean;
  /** Platform OAuth app credentials exist on this deployment. */
  available: boolean;
  /** What the platform operator must set for this to go live. */
  requiredEnv: string[];
}

const REQUIRED_ENV: Record<string, string[]> = {
  instagram: ["META_APP_ID", "META_APP_SECRET"],
  facebook: ["META_APP_ID", "META_APP_SECRET"],
};

export function platformStatuses(): PlatformStatus[] {
  return Object.values(ADAPTERS).map((a) => ({
    id: a.id,
    name: a.name,
    supported: !(a instanceof UnavailableAdapter),
    available: a.isConfigured(),
    requiredEnv: REQUIRED_ENV[a.id] ?? [],
  }));
}
