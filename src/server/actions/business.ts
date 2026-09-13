"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser, requireTenant, assertTenantOwns } from "@/server/tenant";
import { audit } from "@/server/audit";
import { slugify } from "@/lib/utils";
import { getPlan } from "@/server/plans";
import type { FormState } from "@/server/actions/auth";

// ── Onboarding: create the tenant ────────────────────────────────────────

const createBusinessSchema = z.object({
  name: z.string().min(2, "Business name needs at least 2 characters.").max(120),
  category: z.string().min(2).max(80),
  city: z.string().max(80).optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  website: z.string().url("Website should be a full URL (https://…)").optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
});

export async function createBusinessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    city: formData.get("city"),
    phone: formData.get("phone"),
    website: formData.get("website"),
    email: formData.get("email"),
    address: formData.get("address"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const data = parsed.data;

  // Per-user business limit comes from the highest plan among owned tenants
  const owned = await db.tenantUser.findMany({
    where: { userId: user.id, role: "OWNER" },
    include: { tenant: true },
  });
  const maxBusinesses = Math.max(
    getPlan("starter").limits.businesses,
    ...owned.map((m) => getPlan(m.tenant.planId).limits.businesses),
  );
  if (owned.length >= maxBusinesses) {
    return { error: `Your plan allows ${maxBusinesses} business${maxBusinesses === 1 ? "" : "es"}. Upgrade to add more.` };
  }

  const base = slugify(data.name);
  let slug = base;
  for (let i = 2; await db.tenant.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`;
  }

  const tenant = await db.tenant.create({
    data: {
      name: data.name,
      slug,
      members: { create: { userId: user.id, role: "OWNER" } },
      businessProfile: {
        create: {
          category: data.category,
          city: data.city || null,
          phone: data.phone || null,
          website: data.website || null,
          email: data.email || null,
          address: data.address || null,
        },
      },
      brandSettings: { create: {} },
      automation: { create: {} },
      subscription: { create: { planId: "starter", status: "TRIALING" } },
    },
  });

  await audit({ tenantId: tenant.id, userId: user.id, action: "tenant.create", targetType: "tenant", targetId: tenant.id });
  redirect(`/onboarding/${tenant.slug}/about`);
}

// ── Onboarding steps ─────────────────────────────────────────────────────

export async function saveAboutAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");
  const aboutRaw = String(formData.get("about") ?? "").slice(0, 4000);
  if (aboutRaw.trim().length < 20) {
    return { error: "Tell us a little more — a few sentences helps the AI a lot." };
  }
  await db.businessProfile.update({
    where: { tenantId: ctx.tenant.id },
    data: { aboutRaw },
  });
  redirect(`/onboarding/${slug}/products`);
}

const productSchema = z.object({
  name: z.string().min(1, "Product name is required.").max(160),
  kind: z.enum(["PRODUCT", "SERVICE"]),
  description: z.string().max(1000).optional().or(z.literal("")),
  price: z.coerce.number().min(0).max(10_000_000).optional().or(z.literal("").transform(() => undefined)),
  category: z.string().max(80).optional().or(z.literal("")),
});

export async function addProductAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind") ?? "PRODUCT",
    description: formData.get("description"),
    price: formData.get("price"),
    category: formData.get("category"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  await db.product.create({
    data: {
      tenantId: ctx.tenant.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      description: parsed.data.description || null,
      price: parsed.data.price ?? null,
      category: parsed.data.category || null,
    },
  });
  revalidatePath(`/onboarding/${slug}/products`);
  revalidatePath(`/app/${slug}/products`);
  return { ok: true };
}

export async function deleteProductAction(slug: string, productId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const product = await db.product.findUnique({ where: { id: productId } });
  assertTenantOwns(ctx, product);
  await db.product.delete({ where: { id: product.id } });
  revalidatePath(`/app/${slug}/products`);
  revalidatePath(`/onboarding/${slug}/products`);
}

const audienceGoalsSchema = z.object({
  audience: z.string().min(5, "Describe your customers in a sentence or two.").max(2000),
  location: z.string().max(120).optional().or(z.literal("")),
  ageRange: z.string().max(40).optional().or(z.literal("")),
});

export async function saveAudienceAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");
  const parsed = audienceGoalsSchema.safeParse({
    audience: formData.get("audience"),
    location: formData.get("location"),
    ageRange: formData.get("ageRange"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const existing = await db.audience.findFirst({ where: { tenantId: ctx.tenant.id } });
  const data = {
    description: parsed.data.audience,
    location: parsed.data.location || null,
    ageRange: parsed.data.ageRange || null,
  };
  if (existing) {
    await db.audience.update({ where: { id: existing.id }, data });
  } else {
    await db.audience.create({ data: { tenantId: ctx.tenant.id, ...data } });
  }
  redirect(`/onboarding/${slug}/goals`);
}

const GOAL_CHOICES = [
  "Increase customers",
  "Increase bookings",
  "Increase sales",
  "Promote products",
  "Promote services",
  "Generate leads",
  "Increase awareness",
  "Increase website traffic",
  "Increase social engagement",
] as const;

export async function saveGoalsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");
  const labels = formData.getAll("goals").map(String).filter((g) => (GOAL_CHOICES as readonly string[]).includes(g));
  if (labels.length === 0) return { error: "Pick at least one goal." };
  const target = Number(formData.get("target") ?? 0) || null;

  await db.marketingGoal.deleteMany({ where: { tenantId: ctx.tenant.id, status: "ACTIVE" } });
  await db.marketingGoal.createMany({
    data: labels.map((label, i) => ({
      tenantId: ctx.tenant.id,
      label,
      targetNumber: i === 0 ? target : null,
      month: new Date().toISOString().slice(0, 7),
    })),
  });
  redirect(`/onboarding/${slug}/frequency`);
}

export async function saveFrequencyAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");
  const freq = String(formData.get("frequency") ?? "3_per_week");
  if (!["daily", "3_per_week", "weekly", "custom"].includes(freq)) {
    return { error: "Pick a posting frequency." };
  }
  await db.businessProfile.update({
    where: { tenantId: ctx.tenant.id },
    data: { postingFrequency: freq, onboardedAt: new Date() },
  });
  await audit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "tenant.onboarded" });
  redirect(`/app/${slug}/dashboard?welcome=1`);
}

// ── Brand settings ───────────────────────────────────────────────────────

const brandSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colors are hex values like #D6367B."),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  toneOfVoice: z.string().max(200).optional().or(z.literal("")),
  brandDescription: z.string().max(2000).optional().or(z.literal("")),
  wordsToUse: z.string().max(1000).optional().or(z.literal("")),
  wordsToAvoid: z.string().max(1000).optional().or(z.literal("")),
  ctaPreference: z.string().max(120).optional().or(z.literal("")),
});

export async function saveBrandAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant(slug, "ADMIN");
  const parsed = brandSchema.safeParse({
    primaryColor: formData.get("primaryColor"),
    secondaryColor: formData.get("secondaryColor"),
    accentColor: formData.get("accentColor"),
    toneOfVoice: formData.get("toneOfVoice"),
    brandDescription: formData.get("brandDescription"),
    wordsToUse: formData.get("wordsToUse"),
    wordsToAvoid: formData.get("wordsToAvoid"),
    ctaPreference: formData.get("ctaPreference"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const csv = (s?: string) =>
    (s ?? "")
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(0, 40);

  await db.brandSettings.update({
    where: { tenantId: ctx.tenant.id },
    data: {
      primaryColor: parsed.data.primaryColor,
      secondaryColor: parsed.data.secondaryColor,
      accentColor: parsed.data.accentColor,
      toneOfVoice: parsed.data.toneOfVoice || null,
      brandDescription: parsed.data.brandDescription || null,
      wordsToUse: csv(parsed.data.wordsToUse),
      wordsToAvoid: csv(parsed.data.wordsToAvoid),
      ctaPreference: parsed.data.ctaPreference || null,
    },
  });
  await audit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "brand.update" });
  revalidatePath(`/app/${slug}/brand`);
  return { ok: true, message: "Brand saved. All new content will follow it." };
}

// ── Offers ───────────────────────────────────────────────────────────────

const offerSchema = z.object({
  title: z.string().min(2, "Give the offer a name.").max(160),
  description: z.string().max(1000).optional().or(z.literal("")),
  price: z.coerce.number().min(0).max(10_000_000).optional().or(z.literal("").transform(() => undefined)),
  endsAt: z.string().optional().or(z.literal("")),
});

export async function addOfferAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const parsed = offerSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    price: formData.get("price"),
    endsAt: formData.get("endsAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  await db.offer.create({
    data: {
      tenantId: ctx.tenant.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      price: parsed.data.price ?? null,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
    },
  });
  revalidatePath(`/app/${slug}/products`);
  return { ok: true };
}

export async function archiveOfferAction(slug: string, offerId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const offer = await db.offer.findUnique({ where: { id: offerId } });
  assertTenantOwns(ctx, offer);
  await db.offer.update({ where: { id: offer.id }, data: { status: "ARCHIVED" } });
  revalidatePath(`/app/${slug}/products`);
}
