import sharp from "sharp";
import { db } from "@/server/db";
import { getAIProvider, isImageGenerationConfigured } from "@/server/ai";
import { getStorageProvider, storageKey } from "@/server/storage";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { audit } from "@/server/audit";
import { log } from "@/server/logger";

// ── AI-painted flyers ─────────────────────────────────────────────────────
// The image model renders the whole creative — lighting, depth, foil type,
// badges — from the owner's own product photo. This is what makes a flyer
// look designed rather than assembled.
//
// The obvious risk is that a model painting text can mangle a price. So we
// read the finished flyer back with a vision model and check the price and
// phone number against the locked facts. A flyer that fails the check is
// regenerated once, then refused — never published with a wrong number.

export type FlyerStyle = "premium" | "fresh" | "bold" | "festive" | "minimal";

const STYLE_DIRECTION: Record<FlyerStyle, string> = {
  premium:
    "Luxurious and dark: deep chocolate/espresso background with warm rim lighting, gold-foil serif headline with subtle bevel and shine, a small foil seal badge, elegant gold divider flourish, rich shallow-depth-of-field bokeh.",
  fresh:
    "Bright and airy: soft daylight, clean light background, crisp modern sans headline, pastel accent shapes, generous white space, gentle natural shadows.",
  bold:
    "High energy: saturated brand colour blocks, oversized condensed uppercase headline, hard diagonal geometry, strong contrast, poster-like impact.",
  festive:
    "Warm celebration: festive glow, soft golden particles and bokeh lights, ornate accents, jewel tones, a sense of occasion without clutter.",
  minimal:
    "Quiet premium: mostly negative space, one hero subject, thin elegant type, a single restrained accent line, editorial calm.",
};

export interface AiFlyerBrief {
  headline: string;
  subline?: string | null;
  price?: string | null;
  when?: string | null;
  cta?: string | null;
  businessName: string;
  phone?: string | null;
  category?: string | null;
  style: FlyerStyle;
  format: "square" | "story";
  brand: { primary: string; secondary: string; accent: string };
  /** True when the owner supplied a design to imitate. */
  hasStyleRef?: boolean;
}

/**
 * The art-direction prompt. Every word that must appear is quoted and listed
 * exactly once, because a model reproduces quoted strings far more reliably
 * than it does paraphrased instructions.
 */
export function flyerPrompt(brief: AiFlyerBrief): string {
  const lines: string[] = [];
  lines.push(
    `Design a professional Instagram ${brief.format === "story" ? "story (9:16 vertical)" : "post (1:1 square)"} advertisement for ${brief.businessName}, a ${brief.category ?? "local business"} in India.`,
  );
  lines.push(
    "Use the provided product photograph as the hero subject — keep the product recognisably the same, but relight and compose it into a polished advertisement with professional styling, props and depth.",
  );
  if (brief.hasStyleRef) {
    // The owner pointed at a design and said "like this". Their reference is
    // the art direction; the preset is only a fallback description.
    lines.push(
      "A reference design is attached. Match its visual style closely — its lighting, materials, colour treatment, typographic weight, composition and level of finish. Do NOT copy any text, logo, product or branding from the reference; it is a style guide only.",
    );
  } else {
    lines.push(`Art direction: ${STYLE_DIRECTION[brief.style]}`);
  }
  lines.push(
    `Brand colours to work with: ${brief.brand.primary} as primary, ${brief.brand.accent} as accent, ${brief.brand.secondary} as the deep tone.`,
  );

  lines.push("");
  lines.push("TEXT TO RENDER — reproduce each of these EXACTLY, spelled character for character, and include nothing else:");
  lines.push(`1. Headline, largest element: "${brief.headline}"`);
  if (brief.subline) lines.push(`2. Supporting line, smaller: "${brief.subline}"`);
  if (brief.price) lines.push(`3. Price, prominent: "${brief.price}"`);
  if (brief.when) lines.push(`4. Timing badge: "${brief.when}"`);
  if (brief.cta) lines.push(`5. Call-to-action button: "${brief.cta}"`);
  lines.push(`6. Business name, small: "${brief.businessName}"`);
  if (brief.phone) lines.push(`7. Phone, small at the bottom: "${brief.phone}"`);

  lines.push("");
  lines.push(
    "Rules: every line of text must be perfectly legible, correctly spelled and free of extra or invented words, numbers or currency symbols. Do not add any price, discount, date, website, address or social handle that is not listed above. No lorem ipsum. No watermark. Typography should be crisp and deliberate, with clear hierarchy and comfortable margins.",
  );
  return lines.join("\n");
}

/** What the vision check must confirm before a flyer is allowed to exist. */
function verificationQuestion(brief: AiFlyerBrief): string {
  const musts = [brief.price, brief.phone].filter(Boolean) as string[];
  return [
    "Read every piece of text in this advertisement image.",
    "Reply with strict JSON only:",
    '{ "text": "<all text you can read, separated by | >", "misspelled": true|false }',
    musts.length
      ? `Pay special attention to numbers. These must appear exactly: ${musts.map((m) => `"${m}"`).join(", ")}.`
      : "",
    'Set "misspelled" to true if any word is garbled, misspelled, or contains invented characters.',
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Does `haystack` contain `needle` as a *whole* number?
 *
 * Plain substring matching is not safe here: "₹1999" contains "₹199", so a
 * model that turned ₹199 into ₹1999 — the exact mistake this check exists to
 * catch — would sail through. We ignore spacing, since a designer's tracking
 * legitimately splits "98765 43210", but we refuse a match with a digit
 * pressed up against either end.
 */
export function containsExactly(haystack: string, needle: string): boolean {
  const squash = (s: string) => s.replace(/[\s\-().]/g, "").toLowerCase();
  const hay = squash(haystack);
  const need = squash(needle);
  if (!need) return true;

  const digit = /\d/;
  for (let i = hay.indexOf(need); i !== -1; i = hay.indexOf(need, i + 1)) {
    const before = hay[i - 1];
    const after = hay[i + need.length];
    const touchesDigit =
      (before !== undefined && digit.test(before) && digit.test(need[0]!)) ||
      (after !== undefined && digit.test(after) && digit.test(need[need.length - 1]!));
    if (!touchesDigit) return true;
  }
  return false;
}

export interface FlyerCheck {
  ok: boolean;
  reason?: string;
  readBack?: string;
}

/** Compares what the model painted against the facts the owner gave us. */
export function checkFlyerText(raw: string, brief: AiFlyerBrief): FlyerCheck {
  let parsed: { text?: string; misspelled?: boolean };
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as typeof parsed;
  } catch {
    // If the checker didn't answer usefully we cannot claim the flyer is safe.
    return { ok: false, reason: "The safety check on the artwork didn't come back clearly." };
  }
  const seen = (parsed.text ?? "").replace(/\s+/g, " ");

  for (const [label, value] of [
    ["price", brief.price],
    ["phone number", brief.phone],
  ] as const) {
    if (!value) continue;
    if (!containsExactly(seen, value)) {
      return {
        ok: false,
        reason: `The artwork didn't show your ${label} correctly.`,
        readBack: seen,
      };
    }
  }
  if (parsed.misspelled) {
    return { ok: false, reason: "Some words in the artwork came out misspelled.", readBack: seen };
  }
  return { ok: true, readBack: seen };
}

export class AiFlyerUnavailable extends Error {
  constructor() {
    super("AI flyer design needs an image model. Set AI_PROVIDER=openai with credit on the account.");
    this.name = "AiFlyerUnavailable";
  }
}

/**
 * Paints a flyer, verifies its text, and stores it. Returns the asset id.
 * Regenerates once if the check fails; refuses rather than shipping a flyer
 * with a wrong price.
 */
export async function generateAiFlyer(params: {
  tenantId: string;
  userId: string;
  brief: AiFlyerBrief;
  /** The owner's product photo. */
  referenceAssetId?: string | null;
  /** A design the owner wants imitated. */
  styleRefAssetId?: string | null;
}): Promise<{ assetId: string; readBack?: string }> {
  const { tenantId, userId, brief } = params;
  if (!isImageGenerationConfigured()) throw new AiFlyerUnavailable();

  await checkEntitlement(tenantId, "ai_image");
  const ai = getAIProvider();
  const storage = getStorageProvider();

  // The product photo comes first so the model reads it as the subject; the
  // style reference follows as art direction.
  const load = async (id: string | null | undefined): Promise<Buffer | null> => {
    if (!id) return null;
    const asset = await db.asset.findFirst({ where: { id, tenantId } });
    if (!asset || asset.kind === "VIDEO") return null;
    const bytes = await storage.get(asset.storageKey);
    // The edits endpoint wants PNG; normalise whatever the owner uploaded.
    return sharp(bytes).rotate().resize(1024, 1024, { fit: "inside" }).png().toBuffer();
  };
  const loaded = (await Promise.all([load(params.referenceAssetId), load(params.styleRefAssetId)])).filter(
    (b): b is Buffer => b !== null,
  );
  const references = loaded.length > 0 ? loaded : undefined;

  const prompt = flyerPrompt({ ...brief, hasStyleRef: Boolean(params.styleRefAssetId) });
  let lastReason = "";
  let readBack: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const image = await ai.generateImage({
      prompt: attempt === 1 ? prompt : `${prompt}\n\nThe previous attempt had a text error: ${lastReason} Render every quoted string with extreme care.`,
      size: brief.format === "story" ? "story" : "square",
      references,
      quality: "high",
    });
    await recordUsage(tenantId, "ai_image");

    // Read it back and compare to the locked facts.
    let check: FlyerCheck = { ok: true };
    if (brief.price || brief.phone) {
      try {
        const answer = await ai.readImage({ image: image.data, question: verificationQuestion(brief) });
        check = checkFlyerText(answer, brief);
        readBack = check.readBack;
      } catch (err) {
        log.error({
          operation: "flyer.verify",
          tenantId,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        check = { ok: false, reason: "We couldn't verify the artwork's text." };
      }
    }

    if (check.ok) {
      const jpeg = await sharp(image.data).jpeg({ quality: 92 }).toBuffer();
      const meta = await sharp(jpeg).metadata();
      const key = await storage.put(
        storageKey(tenantId, `ai-flyer-${brief.style}-${brief.format}.jpg`),
        jpeg,
        "image/jpeg",
      );
      const asset = await db.asset.create({
        data: {
          tenantId,
          kind: "FLYER",
          filename: `${brief.headline.slice(0, 50)} — ${brief.style}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: jpeg.length,
          storageKey: key,
          width: meta.width ?? null,
          height: meta.height ?? null,
          tags: ["flyer", "ai-designed", brief.style, brief.format],
          createdById: userId,
        },
      });
      await audit({
        tenantId,
        userId,
        action: "asset.ai_flyer",
        targetType: "asset",
        targetId: asset.id,
        meta: { style: brief.style, attempts: attempt, model: image.model },
      });
      return { assetId: asset.id, readBack };
    }

    lastReason = check.reason ?? "text error";
    log.info({ operation: "flyer.retry", tenantId, status: "ok", attempt, reason: lastReason });
  }

  throw new Error(
    `${lastReason} We tried twice and won't publish a flyer with the wrong numbers — use a designed template instead, or try again.`,
  );
}
