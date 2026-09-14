import { db } from "@/server/db";
import { getAIProvider } from "@/server/ai";
import { buildBusinessContext } from "@/server/ai/context";
import { videoScriptPrompt } from "@/server/ai/prompts";
import { videoScriptSchema, PROMPT_VERSIONS } from "@/server/ai/schemas";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { audit } from "@/server/audit";
import type { Prisma } from "@prisma/client";

// ── Short video planning (§12) ────────────────────────────────────────────
// Reels are how Instagram reaches people now, but a shop owner can't produce
// a studio video. So we produce the thing they can act on: a shootable plan.

export async function generateVideoScript(params: {
  tenantId: string;
  userId: string;
  topic: string;
  format?: "reel" | "story" | "short";
  durationSec?: number;
  campaignId?: string | null;
  /** When set, attaches the finished script to an existing calendar slot. */
  contentItemId?: string | null;
}): Promise<string> {
  const {
    tenantId,
    userId,
    topic,
    format = "reel",
    durationSec = 15,
    campaignId = null,
    contentItemId = null,
  } = params;

  await checkEntitlement(tenantId, "ai_text");

  const ctx = await buildBusinessContext(tenantId);
  const prompt = videoScriptPrompt(ctx, { topic, format, durationSec });

  const result = await getAIProvider().generateStructured(
    {
      task: "content",
      schemaName: PROMPT_VERSIONS.videoScript,
      system: prompt.system,
      prompt: prompt.prompt,
    },
    videoScriptSchema,
  );
  await recordUsage(tenantId, "ai_text");

  const generatedBy = `${result.provider}:${result.model}`;
  const data = result.data;

  const scriptId = await db.$transaction(async (tx) => {
    const script = await tx.videoScript.create({
      data: {
        tenantId,
        campaignId,
        concept: data.concept,
        hook: data.hook,
        shots: data.shots as unknown as Prisma.InputJsonValue,
        voiceover: data.voiceover,
        caption: data.caption,
        cta: data.cta,
        hashtags: data.hashtags,
        durationSec: data.durationSec,
        format: data.format,
        status: "READY",
        generatedBy,
        promptVersion: PROMPT_VERSIONS.videoScript,
      },
    });

    if (contentItemId) {
      // Attach to the existing slot the owner asked about.
      await tx.contentItem.updateMany({
        where: { id: contentItemId, tenantId },
        data: {
          videoScriptId: script.id,
          contentType: data.format === "story" ? "STORY" : "REEL",
          title: data.concept.slice(0, 160),
          body: data.caption,
          hook: data.hook,
          cta: data.cta,
          hashtags: data.hashtags,
          status: "NEEDS_REVIEW",
          aiGenerated: true,
          generatedBy,
          promptVersion: PROMPT_VERSIONS.videoScript,
        },
      });
    } else {
      const when = new Date();
      when.setDate(when.getDate() + 1);
      when.setHours(18, 0, 0, 0);
      await tx.contentItem.create({
        data: {
          tenantId,
          campaignId,
          videoScriptId: script.id,
          platform: "instagram",
          contentType: data.format === "story" ? "STORY" : "REEL",
          title: data.concept.slice(0, 160),
          body: data.caption,
          hook: data.hook,
          cta: data.cta,
          hashtags: data.hashtags,
          scheduledAt: when,
          status: "NEEDS_REVIEW",
          aiGenerated: true,
          generatedBy,
          promptVersion: PROMPT_VERSIONS.videoScript,
        },
      });
    }

    return script.id;
  });

  await audit({
    tenantId,
    userId,
    action: "video.script_generate",
    targetType: "video_script",
    targetId: scriptId,
    meta: { format, durationSec },
  });

  return scriptId;
}
