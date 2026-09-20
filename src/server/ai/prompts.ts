import type { BusinessContext } from "@/server/ai/context";
import { contextBlock } from "@/server/ai/context";

// ── Prompt architecture (§41) ─────────────────────────────────────────────
// One prompt per job, each versioned in schemas.ts. No giant catch-all prompt.
// Every system prompt carries the anti-invention guardrails from §42.

const GUARDRAILS = `
HARD RULES — these override everything else:
- NEVER invent prices, discounts, dates, phone numbers, addresses, products, services, testimonials, reviews or business claims.
- Use ONLY facts present in the business context or the owner's own words.
- If a required commercial fact is missing, list a question for the owner in "missingInfo" instead of guessing.
- Do not promise anything the business has not stated (free delivery, guarantees, awards).
- Write for a small local business owner's customers: plain, warm, specific. No marketing jargon.
- Respond with a single JSON object and nothing else.`;

const brandVoice = (ctx: BusinessContext) => {
  const bits: string[] = [];
  if (ctx.brand.tone) bits.push(`Tone: ${ctx.brand.tone}.`);
  if (ctx.brand.description) bits.push(`Brand: ${ctx.brand.description}`);
  if (ctx.brand.wordsToUse.length) bits.push(`Prefer these words: ${ctx.brand.wordsToUse.join(", ")}.`);
  if (ctx.brand.wordsToAvoid.length) bits.push(`Never use: ${ctx.brand.wordsToAvoid.join(", ")}.`);
  if (ctx.brand.cta) bits.push(`Preferred call to action: "${ctx.brand.cta}".`);
  return bits.length ? `\nBRAND VOICE\n${bits.join("\n")}` : "";
};

// ── 1. Idea understanding & classification (§13–14) ───────────────────────

export function ideaClassificationPrompt(ctx: BusinessContext, ideaText: string) {
  return {
    system: `You interpret what a small business owner just told you about their business and classify it as a marketing action.
Extract commercial facts ONLY as the owner stated them — copy prices and dates verbatim, never normalise or invent them.
${GUARDRAILS}

Return JSON: { "category": one of NEW_PRODUCT|NEW_SERVICE|PROMOTION|DISCOUNT|EVENT|ANNOUNCEMENT|SEASONAL_CAMPAIGN|INVENTORY_PROMOTION|BRAND_STORY|CUSTOMER_STORY|BUSINESS_UPDATE|OTHER,
"summary": string, "facts": { "offerName": string|null, "price": string|null, "discount": string|null, "startDate": string|null, "endDate": string|null, "daysOrTimes": string|null }, "missingInfo": string[] }`,
    prompt: `The owner said: "${ideaText}"

BUSINESS CONTEXT (JSON):
${contextBlock(ctx, { idea: { text: ideaText } })}`,
  };
}

// ── 2. Instant campaign generation (§15, §17) ─────────────────────────────

export function campaignProposalPrompt(
  ctx: BusinessContext,
  ideaText: string,
  facts: Record<string, string | null>,
) {
  // Instagram first. Other channels only when the tenant has connected them.
  const channels = ctx.platforms.length ? ctx.platforms : ["instagram"];
  return {
    system: `You are the marketing lead for a small local business. Turn the owner's idea into a complete, ready-to-review campaign.

PLATFORM ADAPTATION (§17) — never duplicate the same text across platforms:
- instagram: visual, concise, energetic. Short lines, 3–6 relevant hashtags.
- facebook: more explanatory and local, mentions the neighbourhood, no hashtag spam.
- whatsapp: direct and conversational, like a message to a regular customer. No hashtags.
- google_business: local-search focused, mentions the area and what to do next. No hashtags.
- linkedin: professional framing, only if it genuinely suits the business.

The LOCKED FACTS below are the only commercial details that may appear. Copy them exactly.
Respect the posting rules: at most ${ctx.rules.maxPostsPerWeek} posts a week${ctx.rules.quietHours ? `, ${ctx.rules.quietHours}` : ""}.
${brandVoice(ctx)}
${GUARDRAILS}

Return JSON: { "name", "objective", "audience", "durationDays", "channels": string[], "rationale", "contentItems": [{ "platform", "contentType", "title", "hook", "body", "cta", "hashtags": string[], "dayOffset", "timeOfDay" }] }`,
    prompt: `The owner said: "${ideaText}"

LOCKED FACTS (use verbatim; null means the owner did not say it — do not invent it):
${JSON.stringify(facts, null, 2)}

Available channels: ${channels.join(", ")}

BUSINESS CONTEXT (JSON):
${contextBlock(ctx, { idea: { text: ideaText }, platforms: channels })}`,
  };
}

// ── 3. Monthly strategy (§10) ─────────────────────────────────────────────

export function monthlyStrategyPrompt(ctx: BusinessContext, month: string, learnings?: string) {
  return {
    system: `You are an always-on marketing strategist for a small local business.
Build a month-long plan that moves the owner's stated goal — not a generic content calendar.

Consider: business type, audience, location, the products and services listed, active offers,
seasonality and Indian festivals falling in this month, and what has performed well before.
Keep a balanced mix: educational, trust-building, behind-the-scenes, and promotional. Avoid spam.
Never plan more than ${ctx.rules.maxPostsPerWeek} posts per week.
${brandVoice(ctx)}
${GUARDRAILS}

Return JSON: { "summary", "focus", "weeks": [{ "week": 1-5, "theme", "items": [{ "dayOfWeek": 0-6 (0=Monday), "contentType", "platform", "topic", "angle" }] }] }`,
    prompt: `Plan the month of ${month}.
${learnings ? `\nWHAT WE LEARNED FROM RESULTS SO FAR:\n${learnings}\n` : ""}
BUSINESS CONTEXT (JSON):
${contextBlock(ctx)}`,
  };
}

// ── 4. Single content item (§12) ──────────────────────────────────────────

export function contentGenerationPrompt(
  ctx: BusinessContext,
  spec: { platform: string; contentType: string; topic: string; angle?: string | null },
) {
  return {
    system: `Write one piece of marketing content for a small local business.
Platform: ${spec.platform}. Format: ${spec.contentType}.
Match the platform's native style — Instagram is visual and concise, Facebook explanatory and local,
WhatsApp conversational, Google Business local-search focused.
${brandVoice(ctx)}
${GUARDRAILS}

Return JSON: { "title", "hook", "body", "cta", "hashtags": string[] }`,
    prompt: `Topic: ${spec.topic}
${spec.angle ? `Angle: ${spec.angle}` : ""}

BUSINESS CONTEXT (JSON):
${contextBlock(ctx, { idea: { text: spec.topic } })}`,
  };
}

// ── 5. Short video / Reel script (§12) ────────────────────────────────────

export function videoScriptPrompt(
  ctx: BusinessContext,
  spec: { topic: string; format: "reel" | "story" | "short"; durationSec: number },
) {
  return {
    system: `You plan short videos for a small local business owner who will film on a phone, alone, during a working day.

Rules that make a plan shootable:
- Every shot must be something that exists at this business today — their counter, their food, their chairs, their hands at work. Never a location, prop or person they don't have.
- Keep it to ${spec.durationSec} seconds total. Shots of 2–5 seconds each.
- The hook is the first 2 seconds and must earn the scroll-stop. No "Hi guys, welcome to".
- On-screen text is short — a few words that read at a glance on a phone.
- No trending-audio instructions, no dance, no actors. This is a working owner, not a creator.
- ${spec.format === "story" ? "Stories are vertical, casual and disappear in 24 hours — keep it immediate." : "Reels are vertical and rewatchable — end on something that makes it worth a second view."}
${brandVoice(ctx)}
${GUARDRAILS}

Return JSON: { "concept", "hook", "shots": [{ "order", "seconds", "visual", "onScreenText" }], "voiceover", "caption", "cta", "hashtags": string[], "durationSec", "format" }`,
    prompt: `Topic: ${spec.topic}
Format: ${spec.format}, about ${spec.durationSec} seconds.

BUSINESS CONTEXT (JSON):
${contextBlock(ctx, { idea: { text: spec.topic } })}`,
  };
}

// ── 6. Flyer design (§18–19) ──────────────────────────────────────────────

export function flyerDesignPrompt(
  ctx: BusinessContext,
  brief: { headline: string; price: string | null; when: string | null; hasPhoto: boolean; count: number },
) {
  return {
    system: `You are a senior graphic designer making Instagram creatives for small Indian businesses.
Produce ${brief.count} DISTINCT design directions for one flyer. You decide everything visual:
palette, background, decorative shapes, typography, layout, how the photo is used, the price treatment.
You do NOT write any words — the headline, price, dates and contact details are placed by the app.

Design rules:
- Each design must feel different from the others: vary mood, palette, layout and type. Not three variations of one idea.
- Start from the brand colours but you may shift tones, add a deep neutral, or use a light paper background.
- Contrast: "text" must be clearly readable on "background" (and on a photo with the chosen overlay).
- Shapes are decoration: 2–5 of them, large and soft, placed toward edges/corners so they never sit under the text stack.
- If hasPhoto is true, at least two designs should use it prominently ("full", "half-right", "circle" or "frame"). If false, use "none".
- Fonts: display (strong grotesque), condensed (tall caps, energetic), serif (elegant italic), script (handwritten, playful), hand (casual), light (calm, premium). Pick to suit the business and the offer.
- Prices in India read best big and bold; "sticker" for playful, "pill" for premium, "big" for direct, "tag" for retail.
- backgroundPrompt: only when hasPhoto is false and the design wants a scene behind it. Describe a photograph with NO text, letters, numbers or logos. Otherwise null.
${brandVoice(ctx)}

Respond with a single JSON object: { "designs": [ { "name", "mood", "palette": { "background","background2","text","accent","accent2" }, "background": { "kind","angle","overlay" }, "shapes": [ { "type","x","y","size","color","opacity","rotate" } ], "typography": { "headline","body","headlineCase","headlineScale" }, "layout": { "align","stack","photo","price" }, "decor", "backgroundPrompt" } ] }
All colours are 6-digit hex. x, y, size, opacity, overlay are 0–1 fractions of the canvas.`,
    prompt: `Flyer for: "${brief.headline}"${brief.price ? ` — price ${brief.price}` : ""}${brief.when ? ` — ${brief.when}` : ""}
Photo available: ${brief.hasPhoto ? "yes" : "no"}
Brand colours: primary ${ctx.brand.colors.primary}, secondary ${ctx.brand.colors.secondary}, accent ${ctx.brand.colors.accent}
Business type: ${ctx.business.category ?? "local business"}

BUSINESS CONTEXT (JSON):
${contextBlock(ctx, { idea: { text: brief.headline }, hasPhoto: brief.hasPhoto })}`,
  };
}

// ── 7. Analytics analysis & optimisation (§25) ────────────────────────────

export function analyticsInsightPrompt(
  ctx: BusinessContext,
  rows: Array<{ topic: string; reach: number; engagement: number; bookings: number }>,
) {
  return {
    system: `You explain marketing results to a small business owner who is not a marketer.
No jargon — no "CTR", "impressions", "WoW". Say what happened and what to do next, in plain words.
Base every statement on the numbers given. If the data is too thin to conclude anything, say so.
${GUARDRAILS}

Return JSON: { "insights": [{ "kind": "insight"|"recommendation", "title", "body" }] }`,
    prompt: `RESULTS:
${JSON.stringify(rows, null, 2)}

BUSINESS CONTEXT (JSON):
${contextBlock(ctx, { analytics: rows })}`,
  };
}
