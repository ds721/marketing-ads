import { db } from "@/server/db";
import { getAIProvider, isImageGenerationConfigured } from "@/server/ai";
import { getStorageProvider, storageKey } from "@/server/storage";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { audit } from "@/server/audit";
import { buildBusinessContext } from "@/server/ai/context";

// ── AI product photos ─────────────────────────────────────────────────────
// For owners who don't have a picture of the thing they're promoting. The
// model only ever draws the scene — every word on the flyer is still laid on
// afterwards by our renderer (§19), so a generated image can't misspell a
// price or invent a phone number.

export class PhotoGenerationUnavailable extends Error {
  constructor() {
    super("Photo generation needs an OpenAI key. Add OPENAI_API_KEY and set AI_PROVIDER=openai.");
    this.name = "PhotoGenerationUnavailable";
  }
}

/** Builds a prompt from what the business actually sells. No text in the image, ever. */
export function photoPrompt(subject: string, category: string | null, style: "warm" | "clean" | "moody"): string {
  const styles = {
    warm: "warm natural window light, shallow depth of field, inviting",
    clean: "bright, minimal background, soft even light, editorial product shot",
    moody: "dark background, dramatic side light, rich colour, premium feel",
  };
  const setting = category
    ? `for a small ${category.toLowerCase()} in India`
    : "for a small local business in India";
  return [
    `Professional photograph of ${subject}, ${setting}.`,
    styles[style] + ".",
    "Photorealistic, high resolution, square composition with space around the subject.",
    "Absolutely no text, letters, numbers, logos, watermarks or captions anywhere in the image.",
  ].join(" ");
}

export async function generateProductPhoto(params: {
  tenantId: string;
  userId: string;
  subject: string;
  style?: "warm" | "clean" | "moody";
}): Promise<string> {
  const { tenantId, userId, subject, style = "warm" } = params;
  if (!isImageGenerationConfigured()) throw new PhotoGenerationUnavailable();

  await checkEntitlement(tenantId, "ai_image");
  const ctx = await buildBusinessContext(tenantId);
  const prompt = photoPrompt(subject, ctx.business.category, style);

  const result = await getAIProvider().generateImage({ prompt, size: "square" });
  await recordUsage(tenantId, "ai_image");

  const key = await getStorageProvider().put(
    storageKey(tenantId, `ai-${subject.slice(0, 30)}.png`),
    result.data,
    "image/png",
  );

  const asset = await db.asset.create({
    data: {
      tenantId,
      kind: "GENERATED",
      filename: `${subject.slice(0, 50)} (AI photo).png`,
      mimeType: "image/png",
      sizeBytes: result.data.length,
      storageKey: key,
      width: 1024,
      height: 1024,
      tags: ["ai-photo", style],
      createdById: userId,
    },
  });

  await audit({
    tenantId,
    userId,
    action: "asset.ai_photo",
    targetType: "asset",
    targetId: asset.id,
    meta: { provider: result.provider, model: result.model, style },
  });
  return asset.id;
}
