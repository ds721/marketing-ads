import { z } from "zod";

// Every AI output the app stores or acts on is validated here first (§40).
// Prompt versions live next to the schemas they must satisfy (§41).

export const PROMPT_VERSIONS = {
  ideaClassification: "idea-classify.v1",
  campaignProposal: "campaign-proposal.v1",
  monthlyStrategy: "monthly-strategy.v1",
  contentGeneration: "content-gen.v1",
  analyticsInsight: "analytics-insight.v1",
  videoScript: "video-script.v1",
  flyerDesign: "flyer-design.v1",
} as const;

export const PLATFORM_IDS = ["instagram", "facebook", "whatsapp", "google_business", "linkedin"] as const;
export const platformId = z.enum(PLATFORM_IDS);

// ── Idea classification (§14) ─────────────────────────────────────────────

export const ideaClassificationSchema = z.object({
  category: z.enum([
    "NEW_PRODUCT", "NEW_SERVICE", "PROMOTION", "DISCOUNT", "EVENT",
    "ANNOUNCEMENT", "SEASONAL_CAMPAIGN", "INVENTORY_PROMOTION",
    "BRAND_STORY", "CUSTOMER_STORY", "BUSINESS_UPDATE", "OTHER",
  ]),
  summary: z.string().min(1).max(300),
  // Commercial facts extracted verbatim from the owner's words — the AI must
  // NOT invent any of these; absent = null (§42).
  facts: z.object({
    offerName: z.string().nullable(),
    price: z.string().nullable(),
    discount: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    daysOrTimes: z.string().nullable(),
  }),
  // Questions to ask the owner when required info is missing. Empty when
  // the idea is complete enough to act on.
  missingInfo: z.array(z.string().max(200)).max(5),
});

export type IdeaClassification = z.infer<typeof ideaClassificationSchema>;

// ── Instant campaign proposal (§15) ───────────────────────────────────────

export const campaignContentItemSchema = z.object({
  platform: platformId,
  contentType: z.enum(["POST", "STORY", "FLYER", "MESSAGE", "UPDATE", "PROMOTION"]),
  title: z.string().min(1).max(160),
  hook: z.string().max(300).nullable(),
  body: z.string().min(1).max(3000),
  cta: z.string().max(160).nullable(),
  hashtags: z.array(z.string().max(60)).max(12),
  dayOffset: z.number().int().min(0).max(30), // days after campaign start
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
});

export const campaignProposalSchema = z.object({
  name: z.string().min(1).max(120),
  objective: z.string().min(1).max(300),
  audience: z.string().min(1).max(300),
  durationDays: z.number().int().min(1).max(60),
  channels: z.array(platformId).min(1),
  rationale: z.string().max(600),
  contentItems: z.array(campaignContentItemSchema).min(1).max(12),
});

export type CampaignProposal = z.infer<typeof campaignProposalSchema>;

// ── Monthly strategy (§10) ────────────────────────────────────────────────

export const strategyWeekItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6), // 0 = Monday
  contentType: z.enum(["POST", "STORY", "FLYER", "UPDATE", "PROMOTION"]),
  platform: platformId,
  topic: z.string().min(1).max(200),
  angle: z.string().max(300).nullable(),
});

export const monthlyStrategySchema = z.object({
  summary: z.string().min(1).max(600),
  focus: z.string().min(1).max(200),
  weeks: z
    .array(
      z.object({
        week: z.number().int().min(1).max(5),
        theme: z.string().min(1).max(160),
        items: z.array(strategyWeekItemSchema).min(1).max(7),
      }),
    )
    .min(2)
    .max(5),
});

export type MonthlyStrategy = z.infer<typeof monthlyStrategySchema>;

// ── Single content item generation (§12) ──────────────────────────────────

export const generatedContentSchema = z.object({
  title: z.string().min(1).max(160),
  hook: z.string().max(300).nullable(),
  body: z.string().min(1).max(3000),
  cta: z.string().max(160).nullable(),
  hashtags: z.array(z.string().max(60)).max(12),
});

export type GeneratedContent = z.infer<typeof generatedContentSchema>;

// ── Short video / Reel script (§12) ───────────────────────────────────────
// We don't generate the video — we generate a plan the owner can shoot on a
// phone: a hook, timed shots, what to say, and the caption.

export const videoScriptSchema = z.object({
  concept: z.string().min(1).max(300),
  hook: z.string().min(1).max(200),
  shots: z
    .array(
      z.object({
        order: z.number().int().min(1).max(12),
        seconds: z.number().int().min(1).max(30),
        visual: z.string().min(1).max(300),
        onScreenText: z.string().max(120).nullable(),
      }),
    )
    .min(2)
    .max(8),
  voiceover: z.string().max(1200).nullable(),
  caption: z.string().min(1).max(2200),
  cta: z.string().max(160).nullable(),
  hashtags: z.array(z.string().max(60)).max(12),
  durationSec: z.number().int().min(5).max(90),
  format: z.enum(["reel", "story", "short"]),
});

export type VideoScriptOutput = z.infer<typeof videoScriptSchema>;

// ── AI flyer design (§18–19) ──────────────────────────────────────────────
// The model is the art director: it decides colours, shapes, type, layout
// and how the photo is treated. It never decides the words — our renderer
// draws the price, dates and contact details from the locked facts.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex colour");
const unit = z.number().min(0).max(1);

export const designShapeSchema = z.object({
  type: z.enum(["circle", "blob", "ring", "stripe", "wave", "arc"]),
  x: unit,
  y: unit,
  size: z.number().min(0.05).max(1.2),
  color: hex,
  opacity: z.number().min(0.05).max(1),
  rotate: z.number().min(-180).max(180).optional(),
});

export const designSpecSchema = z.object({
  name: z.string().min(1).max(40),
  mood: z.string().min(1).max(120),
  palette: z.object({
    background: hex,
    background2: hex, // second stop when the background is a gradient
    text: hex,
    accent: hex,
    accent2: hex,
  }),
  background: z.object({
    kind: z.enum(["solid", "gradient", "photo"]),
    angle: z.number().min(0).max(360).optional(),
    /** Darkening over a photo so text reads: 0 none … 1 black. */
    overlay: unit.optional(),
  }),
  shapes: z.array(designShapeSchema).max(6),
  typography: z.object({
    headline: z.enum(["display", "condensed", "serif", "script", "hand", "light"]),
    body: z.enum(["body", "display", "light"]),
    headlineCase: z.enum(["upper", "title"]),
    /** 1 = normal; 0.7 quieter; 1.3 louder. */
    headlineScale: z.number().min(0.6).max(1.4),
  }),
  layout: z.object({
    align: z.enum(["left", "center"]),
    /** Where the text stack sits vertically. */
    stack: z.enum(["top", "middle", "bottom"]),
    photo: z.enum(["full", "circle", "frame", "half-right", "half-top", "none"]),
    price: z.enum(["big", "sticker", "pill", "tag"]),
  }),
  decor: z.enum(["auto", "none"]),
  /** Optional: a scene for an AI background image. Must describe no text. */
  backgroundPrompt: z.string().max(300).nullable(),
});

export const designSetSchema = z.object({
  designs: z.array(designSpecSchema).min(1).max(4),
});

export type DesignSpec = z.infer<typeof designSpecSchema>;
export type DesignSet = z.infer<typeof designSetSchema>;

// ── Analytics insight (§25) ───────────────────────────────────────────────

export const insightSchema = z.object({
  insights: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        body: z.string().min(1).max(600),
        kind: z.enum(["insight", "recommendation"]),
      }),
    )
    .min(1)
    .max(5),
});

export type InsightOutput = z.infer<typeof insightSchema>;
