// Plan & entitlement configuration. Single source of truth — nothing else
// in the codebase may hardcode a limit. Values are per calendar month
// unless marked otherwise.

export type PlanId = "starter" | "growth" | "pro";

export type UsageMetric =
  | "ai_text"
  | "ai_image"
  | "posts_published"
  | "campaigns"
  | "connected_accounts" // absolute, not monthly
  | "businesses" // absolute, per user
  | "storage_mb" // absolute
  | "team_members"; // absolute

export interface Plan {
  id: PlanId;
  name: string;
  priceInrMonthly: number;
  limits: Record<UsageMetric, number>;
  features: {
    scheduling: boolean;
    analytics: boolean;
    campaignAutomation: boolean;
    customBranding: boolean;
    customDomain: boolean;
  };
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceInrMonthly: 999,
    limits: {
      ai_text: 60,
      ai_image: 15,
      posts_published: 30,
      campaigns: 4,
      connected_accounts: 2,
      businesses: 1,
      storage_mb: 500,
      team_members: 2,
    },
    features: {
      scheduling: true,
      analytics: false,
      campaignAutomation: false,
      customBranding: false,
      customDomain: false,
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceInrMonthly: 2499,
    limits: {
      ai_text: 300,
      ai_image: 80,
      posts_published: 120,
      campaigns: 15,
      connected_accounts: 5,
      businesses: 1,
      storage_mb: 5_000,
      team_members: 5,
    },
    features: {
      scheduling: true,
      analytics: true,
      campaignAutomation: true,
      customBranding: false,
      customDomain: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInrMonthly: 5999,
    limits: {
      ai_text: 1200,
      ai_image: 300,
      posts_published: 500,
      campaigns: 60,
      connected_accounts: 10,
      businesses: 5,
      storage_mb: 25_000,
      team_members: 15,
    },
    features: {
      scheduling: true,
      analytics: true,
      campaignAutomation: true,
      customBranding: true,
      customDomain: true,
    },
  },
};

export function getPlan(planId: string): Plan {
  return PLANS[(planId as PlanId) in PLANS ? (planId as PlanId) : "starter"];
}
