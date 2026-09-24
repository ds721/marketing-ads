import type { z } from "zod";
import { deflateSync } from "zlib";
import {
  AiOutputInvalidError,
  type AIProvider,
  type ImageGenerationInput,
  type ImageGenerationResult,
  type StructuredGenerationInput,
  type TextGenerationInput,
  type TextGenerationResult,
} from "@/server/ai/types";
import { PROMPT_VERSIONS } from "@/server/ai/schemas";

// ── Development provider (AI_PROVIDER=mock) ───────────────────────────────
// NOT a production integration. It produces deterministic, schema-valid output
// derived from the tenant's real business context so the full product loop can
// be exercised without an API key. Everything it produces is surfaced in the UI
// behind an explicit "Demo AI" badge — see isMockAi() in src/server/ai/index.ts.

interface PromptContext {
  business?: { name?: string; category?: string; city?: string };
  brand?: { tone?: string; cta?: string; colors?: { primary: string; secondary: string; accent: string } };
  hasPhoto?: boolean;
  products?: Array<{ name?: string; price?: string | null; kind?: string }>;
  offers?: Array<{ title?: string; price?: string | null }>;
  audience?: { description?: string };
  goals?: string[];
  idea?: { text?: string };
  platforms?: string[];
  analytics?: Array<{ topic?: string; engagement?: number; bookings?: number }>;
}

const CONTEXT_MARKER = "BUSINESS CONTEXT (JSON):";

/**
 * Prompts embed their context under a labelled marker; the mock reads it back.
 * Anchoring on the marker matters — some prompts carry an earlier JSON block
 * (the locked facts), and spanning from the first brace would capture both and
 * parse as nothing.
 */
function readContext(prompt: string): PromptContext {
  const marker = prompt.lastIndexOf(CONTEXT_MARKER);
  const from = marker === -1 ? 0 : marker + CONTEXT_MARKER.length;
  const start = prompt.indexOf("{", from);
  const end = prompt.lastIndexOf("}");
  if (start === -1 || end <= start) return {};
  try {
    return JSON.parse(prompt.slice(start, end + 1)) as PromptContext;
  } catch {
    return {};
  }
}

const RUPEE = /(?:₹|rs\.?\s?|inr\s?)(\d[\d,]*)/i;
/** A bare number the owner typed when asked "what's the price?" — "199". */
const BARE_AMOUNT = /(?:^|\s)(\d{2,6})(?:\s|$)/;
const PERCENT = /(\d{1,2})\s?%/;
/** Offers whose value is the deal itself, so there is no price to ask for. */
const SELF_PRICED = /buy\s*(one|1|any).{0,20}(get|free)|bogo|free\b|half\s*price|complimentary/i;

function classifyIdea(text: string): string {
  const t = text.toLowerCase();
  if (/anniversar|years|celebrat/.test(t)) return "EVENT";
  if (/closed|holiday|timing|open/.test(t)) return "BUSINESS_UPDATE";
  if (PERCENT.test(t) || /discount|off\b/.test(t)) return "DISCOUNT";
  if (/combo|offer|special|deal|₹|rs\.?\s?\d/.test(t)) return "PROMOTION";
  if (/new service|now offering/.test(t)) return "NEW_SERVICE";
  if (/new (product|item|dish)|launch/.test(t)) return "NEW_PRODUCT";
  if (/extra|left over|leftover|surplus|stock/.test(t)) return "INVENTORY_PROMOTION";
  if (/customer|review|testimonial/.test(t)) return "CUSTOMER_STORY";
  if (/festival|diwali|pongal|christmas|ramadan|new year/.test(t)) return "SEASONAL_CAMPAIGN";
  return "ANNOUNCEMENT";
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
/** "1 October", "Oct 15", "15th Aug", "15/10", "15-10-2026". */
const DATE_TOKEN = new RegExp(
  `\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})[a-z]*|(?:${MONTHS})[a-z]*\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?)\\b`,
  "gi",
);
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * When is this running? Echoed from the owner's own words, never inferred —
 * "Sunday" is never widened to "the weekend", and a month is never guessed.
 *
 * Owners write timing in every shape: "every Tuesday and Wednesday",
 * "1 October to 31 October", "this weekend". Anything we fail to recognise
 * here turns into another question on screen, so this is deliberately broad.
 */
export function weekendWindow(text: string): { start: string | null; end: string | null; days: string | null } {
  const t = text.toLowerCase();

  // Named days, echoed in week order and only the ones actually said.
  const named = WEEKDAYS.filter((d) => new RegExp(`\\b${d}`, "i").test(t));
  const dayLabel =
    named.length === 0 || named.length === 7
      ? null
      : named.length === 1
        ? named[0]!
        : `${named.slice(0, -1).join(", ")} & ${named[named.length - 1]!}`;

  // Explicit calendar dates are the most specific thing said, but "every
  // Tuesday and Wednesday, 1–31 October" means both, and an owner who wrote
  // both wants both on the flyer.
  const dates = text.match(DATE_TOKEN);
  if (dates && dates.length > 0) {
    const first = dates[0]!.trim();
    const last = dates.length > 1 ? dates[dates.length - 1]!.trim() : null;
    const span = last ? `${first} – ${last}` : first;
    const prefix = dayLabel ? `${/\bevery\b/.test(t) ? "Every " : ""}${dayLabel}, ` : "";
    return { start: first, end: last, days: `${prefix}${span}` };
  }

  if (named.length === 7 || /\b(daily|every\s*day|all\s*week)\b/.test(t)) {
    return { start: null, end: null, days: "Every day" };
  }
  if (named.length === 2 && named[0] === "Saturday" && named[1] === "Sunday") {
    return { start: null, end: null, days: "Saturday & Sunday" };
  }
  if (dayLabel) {
    return { start: null, end: null, days: /\bevery\b/.test(t) ? `Every ${dayLabel}` : dayLabel };
  }

  if (/weekend/.test(t)) return { start: null, end: null, days: "Saturday & Sunday" };
  if (/\btoday\b/.test(t)) return { start: null, end: null, days: "Today" };
  if (/\btomorrow\b/.test(t)) return { start: null, end: null, days: "Tomorrow" };
  return { start: null, end: null, days: null };
}



const DAY_WORDS =
  "weekend|weekends|weekday|weekdays|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday";
/** "every Tuesday", "this weekend", "on Sunday" — where the offer name ends. */
const TIME_CLAUSE = new RegExp(
  `\\b(?:(?:every|each|this|on|all|from|starting|until|till)\\s+)?(?:${DAY_WORDS})\\b`,
  "i",
);
const TRAILING_JOINER = /[\s,–-]+(?:and|or|for|on|at|from|every|each|all|this|with|starting|only)$/i;

/**
 * The offer name is the headline, so it has to read as a phrase. The price and
 * the timing are stored as separate facts and printed separately, so they're
 * cut here — but *cut*, not excised: deleting "Tuesday" and "Wednesday" out of
 * "every Tuesday and Wednesday this month" leaves "every and this month" on
 * the flyer. We truncate at the point the timing starts instead.
 */
export function offerNameFrom(text: string): string | null {
  const sentence = (text.split(/[.,\n]/)[0] ?? "").replace(
    /(?:for\s+)?(?:₹|rs\.?\s?|inr\s?)\d[\d,]*/i,
    "",
  );

  let name = sentence;
  const at = sentence.search(TIME_CLAUSE);
  // Only cut when something substantial comes first — "Weekend brunch buffet"
  // starts with a day word and is the whole offer name.
  if (at > 0 && sentence.slice(0, at).trim().length >= 3) name = sentence.slice(0, at);

  name = name.replace(/\s{2,}/g, " ").trim();
  while (TRAILING_JOINER.test(name)) name = name.replace(TRAILING_JOINER, "");
  name = name.replace(/[\s,–-]+$/, "").trim();
  return name.slice(0, 80) || null;
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  private readonly model = "mock-deterministic-v1";

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    const ctx = readContext(input.prompt);
    const name = ctx.business?.name ?? "your business";
    return {
      text: `[Demo AI] Draft for ${name}. Configure OPENAI_API_KEY to generate real copy.`,
      model: this.model,
      provider: this.name,
    };
  }

  async generateStructured<T>(
    input: StructuredGenerationInput,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; model: string; provider: string }> {
    const ctx = readContext(input.prompt);
    const payload = this.build(input.schemaName, ctx);
    const result = schema.safeParse(payload);
    if (!result.success) {
      throw new AiOutputInvalidError(
        input.schemaName,
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    return { data: result.data, model: this.model, provider: this.name };
  }

  private build(schemaName: string, ctx: PromptContext): unknown {
    switch (schemaName) {
      case PROMPT_VERSIONS.ideaClassification:
        return this.idea(ctx);
      case PROMPT_VERSIONS.campaignProposal:
        return this.campaign(ctx);
      case PROMPT_VERSIONS.monthlyStrategy:
        return this.strategy(ctx);
      case PROMPT_VERSIONS.contentGeneration:
        return this.content(ctx);
      case PROMPT_VERSIONS.analyticsInsight:
        return this.insight(ctx);
      case PROMPT_VERSIONS.videoScript:
        return this.videoScript(ctx);
      case PROMPT_VERSIONS.flyerDesign:
        return this.flyerDesign(ctx);
      default:
        throw new AiOutputInvalidError(schemaName, "mock provider has no template for this schema");
    }
  }

  private idea(ctx: PromptContext) {
    const text = ctx.idea?.text ?? "";
    const category = classifyIdea(text);
    // A price the owner marked (₹199), or a bare number they typed when asked.
    const price = text.match(RUPEE)?.[1] ?? text.match(BARE_AMOUNT)?.[1] ?? null;
    const discount = text.match(PERCENT)?.[0] ?? null;
    const window = weekendWindow(text);
    // "Buy one get one" and "free" price themselves — the deal IS the offer.
    const selfPriced = SELF_PRICED.test(text);

    // Guardrail (§42): commercial facts are only ever echoed from the owner's
    // own words. When a promotion has no price, ask instead of inventing one —
    // but only when a price is actually the missing piece.
    const missingInfo: string[] = [];
    if ((category === "PROMOTION" || category === "DISCOUNT") && !price && !discount && !selfPriced) {
      missingInfo.push("What is the offer price or discount?");
    }
    if ((category === "PROMOTION" || category === "DISCOUNT" || category === "EVENT") && !window.days) {
      missingInfo.push("Which dates should this run?");
    }

    return {
      category,
      summary: text.slice(0, 200) || "New marketing idea",
      facts: {
        // The offer name is the sentence minus the price and the day — those
        // are separate facts and would otherwise be printed twice.
        offerName: offerNameFrom(text),
        price: price ? `₹${price}` : null,
        discount,
        startDate: window.start,
        endDate: window.end,
        daysOrTimes: window.days,
      },
      missingInfo,
    };
  }

  private campaign(ctx: PromptContext) {
    const text = ctx.idea?.text ?? "";
    const biz = ctx.business?.name ?? "our shop";
    const city = ctx.business?.city ?? "your area";
    const cta = ctx.brand?.cta ?? "Order now";
    const price = text.match(RUPEE)?.[1];
    const priceLabel = price ? `₹${price}` : null;
    // Use the cleaned offer name, not the raw sentence — otherwise the price
    // the owner typed is printed twice in one line.
    const subject = offerNameFrom(text) ?? "our latest offer";
    const channels = (ctx.platforms?.length ? ctx.platforms : ["instagram"]).slice(0, 4);
    const window = weekendWindow(text);

    const line = (p: string) => {
      switch (p) {
        case "instagram":
          return `${subject}${priceLabel ? ` — ${priceLabel}` : ""}. ${window.days ?? "Limited time"} at ${biz}. ${cta}.`;
        case "facebook":
          return `${biz} in ${city}: ${subject}${priceLabel ? ` for just ${priceLabel}` : ""}. ${window.days ? `Available ${window.days}.` : "Available for a limited time."} ${cta} — walk in or message us.`;
        case "whatsapp":
          return `Hi! ${subject}${priceLabel ? ` — ${priceLabel}` : ""} at ${biz}${window.days ? ` this ${window.days}` : ""}. Reply to reserve yours.`;
        case "google_business":
          return `${subject}${priceLabel ? ` — ${priceLabel}` : ""}. Visit ${biz}, ${city}. ${cta}.`;
        default:
          return `${biz}: ${subject}${priceLabel ? ` (${priceLabel})` : ""}. ${cta}.`;
      }
    };

    const items = channels.flatMap((p, i) => {
      const base = {
        platform: p,
        title: `${subject}${p === "instagram" ? "" : ` — ${p.replace("_", " ")}`}`.slice(0, 120),
        // A short day name reads well as "Sunday only 👀"; a full date range
        // does not, so it gets its own phrasing.
        hook:
          p === "instagram"
            ? window.days
              ? window.days.length > 22
                ? `${window.days} 👀`
                : `${window.days} only 👀`
              : "This week only 👀"
            : null,
        body: line(p),
        cta,
        hashtags: p === "instagram" ? ["#" + city.replace(/\s/g, ""), "#local", "#offer"] : [],
        dayOffset: i === 0 ? 0 : 1,
        timeOfDay: p === "whatsapp" ? "11:00" : "18:00",
        contentType: p === "whatsapp" ? ("MESSAGE" as const) : ("POST" as const),
      };
      if (p !== "instagram") return [base];
      return [
        base,
        { ...base, contentType: "STORY" as const, title: `${subject} — story`, hook: "Last chance ⏰", hashtags: [], dayOffset: 2, timeOfDay: "12:00" },
      ];
    });

    return {
      name: `${subject.slice(0, 60)}${window.days ? ` — ${window.days}` : ""}`.slice(0, 110),
      objective: `Drive ${ctx.goals?.[0]?.toLowerCase() ?? "more customers"} from ${city}`,
      audience: ctx.audience?.description?.slice(0, 200) ?? `Local customers near ${city}`,
      durationDays: window.days === "Today" ? 1 : 4,
      channels,
      rationale: "[Demo AI] Channel mix and timing follow your posting rules and connected platforms.",
      contentItems: items,
    };
  }

  private strategy(ctx: PromptContext) {
    const products = (ctx.products ?? []).map((p) => p.name).filter(Boolean) as string[];
    const goal = ctx.goals?.[0] ?? "Increase customers";
    const platform = (ctx.platforms?.[0] ?? "instagram") as string;
    const second = (ctx.platforms?.[1] ?? platform) as string;
    const topicFor = (i: number) => products[i % Math.max(products.length, 1)] ?? "what we do best";

    const themes = [
      "Get known — educational content",
      "Build trust — customer stories",
      "Show the work — behind the scenes",
      "Convert — offer & last chance",
    ];

    return {
      summary: `[Demo AI] A four-week plan built around "${goal}". Weeks 1–2 build awareness and trust, weeks 3–4 turn attention into visits.`,
      focus: goal,
      weeks: themes.map((theme, w) => ({
        week: w + 1,
        theme,
        items: [
          { dayOfWeek: 0, contentType: "POST" as const, platform, topic: `${topicFor(w)} — tips your customers ask about`, angle: "Helpful, no hard sell" },
          { dayOfWeek: 2, contentType: "POST" as const, platform: second, topic: w % 2 === 0 ? "Customer story" : `Why people come back for ${topicFor(w + 1)}`, angle: "Real voices" },
          { dayOfWeek: 4, contentType: w === 3 ? ("PROMOTION" as const) : ("STORY" as const), platform, topic: w === 3 ? "Month-end offer" : "Behind the scenes", angle: w === 3 ? "Clear deadline" : "Human & warm" },
        ],
      })),
    };
  }

  private content(ctx: PromptContext) {
    const biz = ctx.business?.name ?? "our shop";
    const topic = ctx.idea?.text ?? "what we do best";
    const cta = ctx.brand?.cta ?? "Visit us today";
    return {
      title: topic.slice(0, 120),
      hook: "[Demo AI] Here's something worth knowing 👇",
      body: `${topic} at ${biz}. ${cta}.`,
      cta,
      hashtags: ["#local", "#" + (ctx.business?.category ?? "business").toLowerCase().replace(/\s/g, "")],
    };
  }

  private videoScript(ctx: PromptContext) {
    const biz = ctx.business?.name ?? "our shop";
    const city = ctx.business?.city ?? "your area";
    const topic = ctx.idea?.text ?? ctx.products?.[0]?.name ?? "what we make";
    const cta = ctx.brand?.cta ?? "Come and try it";
    const price = topic.match(RUPEE)?.[1];

    return {
      concept: `[Demo AI] A close, unhurried look at ${topic} being made at ${biz}.`,
      hook: `This is what ${topic.split(" ").slice(0, 4).join(" ")} looks like up close 👀`,
      shots: [
        { order: 1, seconds: 3, visual: `Tight shot of ${topic} — the most appetising angle you have.`, onScreenText: topic.slice(0, 40) },
        { order: 2, seconds: 5, visual: "Hands working: the step customers never get to see.", onScreenText: "Made fresh, every day" },
        { order: 3, seconds: 4, visual: "Pull back to show the counter or shop front.", onScreenText: `${biz}, ${city}` },
        { order: 4, seconds: 3, visual: "A customer's reaction, or the finished item held up to camera.", onScreenText: price ? `₹${price}` : cta },
      ],
      voiceover: `[Demo AI] Say it plainly: what it is, what's in it, and why people keep coming back for it.`,
      caption: `${topic}${price ? ` — ₹${price}` : ""} at ${biz}, ${city}. ${cta}.`,
      cta,
      hashtags: ["#" + city.replace(/\s/g, ""), "#local", "#" + (ctx.business?.category ?? "food").toLowerCase().replace(/\s/g, "")],
      durationSec: 15,
      format: "reel" as const,
    };
  }

  /** Three deliberately different directions from the brand colours. */
  private flyerDesign(ctx: PromptContext) {
    const c = ctx.brand?.colors ?? { primary: "#D6367B", secondary: "#2E2447", accent: "#F5A31C" };
    const photo = Boolean(ctx.hasPhoto);
    return {
      designs: [
        {
          name: "Bold & direct",
          mood: "[Demo AI] Loud, confident, brand-forward",
          palette: { background: c.primary, background2: c.secondary, text: "#FFFFFF", accent: c.accent, accent2: "#FFFFFF" },
          background: { kind: "gradient", angle: 135, overlay: 0.55 },
          shapes: [
            { type: "blob", x: 0.9, y: 0.1, size: 0.6, color: c.accent, opacity: 0.22 },
            { type: "circle", x: 0.08, y: 0.92, size: 0.4, color: c.accent, opacity: 0.14 },
          ],
          typography: { headline: "condensed", body: "body", headlineCase: "upper", headlineScale: 1 },
          layout: { align: "left", stack: "middle", photo: photo ? "circle" : "none", price: "big" },
          decor: "auto",
          backgroundPrompt: null,
        },
        {
          name: "Warm paper",
          mood: "[Demo AI] Light, friendly, handwritten",
          palette: { background: "#FFF6EC", background2: "#FFE8D2", text: c.secondary, accent: c.primary, accent2: c.accent },
          background: { kind: "gradient", angle: 180, overlay: 0.3 },
          shapes: [
            { type: "blob", x: 0.85, y: 0.15, size: 0.7, color: c.accent, opacity: 0.45 },
            { type: "circle", x: 0.12, y: 0.9, size: 0.5, color: c.primary, opacity: 0.15 },
            { type: "ring", x: 0.9, y: 0.8, size: 0.2, color: c.secondary, opacity: 0.12 },
          ],
          typography: { headline: "script", body: "body", headlineCase: "title", headlineScale: 1 },
          layout: { align: "left", stack: "bottom", photo: photo ? "half-top" : "none", price: "sticker" },
          decor: "auto",
          backgroundPrompt: null,
        },
        {
          name: "Night editorial",
          mood: "[Demo AI] Dark, premium, magazine-like",
          palette: { background: "#1A1426", background2: "#2A1F3D", text: "#FFFFFF", accent: c.accent, accent2: c.primary },
          background: { kind: photo ? "photo" : "gradient", angle: 160, overlay: 0.65 },
          shapes: [
            { type: "arc", x: 0.5, y: 0.5, size: 1.1, color: c.primary, opacity: 0.25, rotate: -20 },
            { type: "circle", x: 0.9, y: 0.85, size: 0.16, color: c.accent, opacity: 0.5 },
          ],
          typography: { headline: "serif", body: "light", headlineCase: "title", headlineScale: 1.05 },
          layout: { align: "center", stack: "middle", photo: photo ? "full" : "none", price: "pill" },
          decor: "auto",
          backgroundPrompt: null,
        },
      ],
    };
  }

  private insight(ctx: PromptContext) {
    const rows = ctx.analytics ?? [];
    const best = [...rows].sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))[0];
    return {
      insights: [
        {
          kind: "insight" as const,
          title: best?.topic ? `${best.topic} content performs best` : "Not enough data yet",
          body: best?.topic
            ? `[Demo AI] ${best.topic} posts earned the most engagement this period${best.bookings ? ` and drove ${best.bookings} tracked bookings` : ""}.`
            : "[Demo AI] Connect a platform and publish a few posts — real insights appear once results come in.",
        },
        {
          kind: "recommendation" as const,
          title: best?.topic ? `Do more ${best.topic.toLowerCase()} next month` : "Publish consistently for two weeks",
          body: best?.topic
            ? `[Demo AI] Increase ${best.topic.toLowerCase()} content by about 25% in next month's plan.`
            : "[Demo AI] A steady posting rhythm gives the AI enough signal to start optimising.",
        },
      ],
    };
  }

  async readImage(): Promise<string> {
    return "[Demo AI] Image reading needs a real provider.";
  }

  /** Minimal PNG encoder — a brand-coloured gradient placeholder for dev. */
  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const w = 512;
    const h = input.size === "square" ? 512 : 768;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    let o = 0;
    for (let y = 0; y < h; y++) {
      raw[o++] = 0; // filter: none
      for (let x = 0; x < w; x++) {
        const t = (x / w + y / h) / 2;
        raw[o++] = Math.round(214 + (245 - 214) * t); // beet → saffron
        raw[o++] = Math.round(54 + (163 - 54) * t);
        raw[o++] = Math.round(123 + (28 - 123) * t);
        raw[o++] = 255;
      }
    }
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body) >>> 0);
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    return { data: png, model: this.model, provider: this.name };
  }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return c ^ -1;
}
