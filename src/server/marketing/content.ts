import { db } from "@/server/db";
import { getAIProvider } from "@/server/ai";
import { buildBusinessContext } from "@/server/ai/context";
import { contentGenerationPrompt } from "@/server/ai/prompts";
import { generatedContentSchema, PROMPT_VERSIONS } from "@/server/ai/schemas";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { audit } from "@/server/audit";

// ── Content generation (§12) ──────────────────────────────────────────────
// Writes the copy for one calendar slot. Strategy fixes topic/platform/time;
// this fills in the words, in the tenant's brand voice.

export async function writeContentItem(params: {
  tenantId: string;
  userId: string;
  contentItemId: string;
}): Promise<void> {
  const { tenantId, userId, contentItemId } = params;

  const item = await db.contentItem.findFirst({
    where: { id: contentItemId, tenantId },
  });
  if (!item) throw new Error("Content not found.");

  await checkEntitlement(tenantId, "ai_text");
  const ctx = await buildBusinessContext(tenantId);
  const ai = getAIProvider();
  const prompt = contentGenerationPrompt(ctx, {
    platform: item.platform,
    contentType: item.contentType,
    topic: item.title,
    angle: item.body || null,
  });

  const result = await ai.generateStructured(
    {
      task: "content",
      schemaName: PROMPT_VERSIONS.contentGeneration,
      system: prompt.system,
      prompt: prompt.prompt,
    },
    generatedContentSchema,
  );
  await recordUsage(tenantId, "ai_text");

  await db.contentItem.update({
    where: { id: item.id },
    data: {
      title: result.data.title,
      body: result.data.body,
      hook: result.data.hook,
      cta: result.data.cta,
      hashtags: result.data.hashtags,
      status: "NEEDS_REVIEW",
      aiGenerated: true,
      generatedBy: `${result.provider}:${result.model}`,
      promptVersion: PROMPT_VERSIONS.contentGeneration,
    },
  });

  await audit({
    tenantId,
    userId,
    action: "content.generate",
    targetType: "content",
    targetId: item.id,
  });
}
