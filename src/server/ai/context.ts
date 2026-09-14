import { db } from "@/server/db";

// ── Business brain (§8) ───────────────────────────────────────────────────
// Builds the structured context every prompt receives. Strictly scoped to one
// tenant — the tenantId comes from an authorised TenantContext, never input.
// Only the fields a prompt actually needs are included (§8: don't send
// unnecessary data to the AI).

export interface BusinessContext {
  business: {
    name: string;
    category: string | null;
    city: string | null;
    about: string | null;
    phone: string | null;
    website: string | null;
    postingFrequency: string | null;
  };
  brand: {
    tone: string | null;
    description: string | null;
    wordsToUse: string[];
    wordsToAvoid: string[];
    cta: string | null;
  };
  products: Array<{ name: string; kind: string; price: string | null; category: string | null }>;
  offers: Array<{ title: string; price: string | null; endsAt: string | null }>;
  audience: { description: string; location: string | null; ageRange: string | null } | null;
  goals: string[];
  platforms: string[];
  rules: {
    maxPostsPerWeek: number;
    quietHours: string | null;
  };
  recentContent: Array<{ title: string; platform: string; status: string }>;
}

export async function buildBusinessContext(tenantId: string): Promise<BusinessContext> {
  const [tenant, profile, brand, products, offers, audience, goals, accounts, automation, recent] =
    await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      db.businessProfile.findUnique({ where: { tenantId } }),
      db.brandSettings.findUnique({ where: { tenantId } }),
      db.product.findMany({ where: { tenantId, isAvailable: true }, take: 40, orderBy: { createdAt: "asc" } }),
      db.offer.findMany({ where: { tenantId, status: "ACTIVE" }, take: 10, orderBy: { createdAt: "desc" } }),
      db.audience.findFirst({ where: { tenantId } }),
      db.marketingGoal.findMany({ where: { tenantId, status: "ACTIVE" }, take: 5 }),
      db.socialAccount.findMany({ where: { tenantId, status: "CONNECTED" } }),
      db.automationSettings.findUnique({ where: { tenantId } }),
      db.contentItem.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { title: true, platform: true, status: true },
      }),
    ]);

  const quietHours =
    automation?.quietHoursStart != null && automation?.quietHoursEnd != null
      ? `no publishing between ${automation.quietHoursStart}:00 and ${automation.quietHoursEnd}:00`
      : null;

  return {
    business: {
      name: tenant.name,
      category: profile?.category ?? null,
      city: profile?.city ?? null,
      about: profile?.aboutRaw ?? null,
      phone: profile?.phone ?? null,
      website: profile?.website ?? null,
      postingFrequency: profile?.postingFrequency ?? null,
    },
    brand: {
      tone: brand?.toneOfVoice ?? null,
      description: brand?.brandDescription ?? null,
      wordsToUse: brand?.wordsToUse ?? [],
      wordsToAvoid: brand?.wordsToAvoid ?? [],
      cta: brand?.ctaPreference ?? null,
    },
    products: products.map((p) => ({
      name: p.name,
      kind: p.kind,
      price: p.price ? `₹${Number(p.price)}` : null,
      category: p.category,
    })),
    offers: offers.map((o) => ({
      title: o.title,
      price: o.price ? `₹${Number(o.price)}` : null,
      endsAt: o.endsAt?.toISOString().slice(0, 10) ?? null,
    })),
    audience: audience
      ? { description: audience.description, location: audience.location, ageRange: audience.ageRange }
      : null,
    goals: goals.map((g) => g.label),
    // Platforms the tenant can actually publish to. Empty = nothing connected;
    // prompts fall back to drafting for the common two without claiming they'll post.
    platforms: accounts.map((a) => a.provider),
    rules: {
      maxPostsPerWeek: automation?.maxPostsPerWeek ?? 5,
      quietHours,
    },
    recentContent: recent,
  };
}

/** The JSON block every prompt embeds; providers parse it back out. */
export function contextBlock(ctx: BusinessContext, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ...ctx, ...extra }, null, 2);
}
