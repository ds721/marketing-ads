import { instagramAdapter } from "@/server/social/adapters/instagram";
import { PlatformNotConfiguredError, type PlatformAdapter } from "@/server/social/types";

// Instagram is the platform we're building for first. The others are listed
// so the integrations page can say "later" honestly rather than hide them.

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
  facebook: new UnavailableAdapter("facebook", "Facebook"),
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
  /** Platform app credentials exist on this deployment. */
  available: boolean;
  /** What the platform operator must set for this to go live. */
  requiredEnv: string[];
}

const REQUIRED_ENV: Record<string, string[]> = {
  instagram: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
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
