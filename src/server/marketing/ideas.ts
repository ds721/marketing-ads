import { db } from "@/server/db";
import { getAIProvider } from "@/server/ai";
import { buildBusinessContext } from "@/server/ai/context";
import { ideaClassificationPrompt, campaignProposalPrompt } from "@/server/ai/prompts";
import {
  ideaClassificationSchema,
  campaignProposalSchema,
  PROMPT_VERSIONS,
  type CampaignProposal,
} from "@/server/ai/schemas";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { audit } from "@/server/audit";
import { log } from "@/server/logger";
import { createCampaignFlyers } from "@/server/creative/campaign-flyer";
import type { ContentType, Idea, IdeaCategory, Prisma } from "@prisma/client";
import type { DesignSpec } from "@/server/ai/schemas";

// ── Idea → campaign engine (§13–16) ───────────────────────────────────────
// The owner types one sentence. We classify it, refuse to invent the facts it
// is missing, and otherwise produce a reviewable campaign with real content.

export interface IdeaResult {
  idea: Idea;
  /** Questions the AI needs answered before it can build the campaign (§42). */
  missingInfo: string[];
  campaignId?: string;
}

export async function submitIdea(params: {
  tenantId: string;
  userId: string;
  text: string;
  mediaAssetId?: string | null;
  /** The owner's answer to the one question we're allowed to ask. */
  extraDetail?: string | null;
  /** Creative choices made up front: which look, which photo, which AI design. */
  templateId?: string | null;
  heroAssetId?: string | null;
  /** A design the owner wants the flyers to look like. */
  styleRefAssetId?: string | null;
  designSpec?: DesignSpec | null;
}): Promise<IdeaResult> {
  const { tenantId, userId } = params;
  // One question, once. `text` already carries any earlier answer, so strip
  // previous additions before appending — otherwise repeated rounds pile up
  // as "Owner added: … Owner added: …" and the sentence turns to noise.
  const base = params.text.split(/\n\nOwner added:/)[0] ?? params.text;
  const text = params.extraDetail ? `${base}\n\nOwner added: ${params.extraDetail}` : params.text;

  await checkEntitlement(tenantId, "ai_text");

  const ctx = await buildBusinessContext(tenantId);
  const ai = getAIProvider();

  // Step 1 — classify and extract only the facts the owner actually stated.
  const classifyPrompt = ideaClassificationPrompt(ctx, text);
  const classified = await ai.generateStructured(
    {
      task: "classify",
      schemaName: PROMPT_VERSIONS.ideaClassification,
      system: classifyPrompt.system,
      prompt: classifyPrompt.prompt,
    },
    ideaClassificationSchema,
  );
  await recordUsage(tenantId, "ai_text");

  // We ask at most one question. If the owner has already answered, we build
  // the campaign with whatever facts we have — an offer with no price simply
  // doesn't print one. Asking twice is how a helpful product becomes a loop.
  const missingInfo = params.extraDetail ? [] : classified.data.missingInfo;

  const idea = await db.idea.create({
    data: {
      tenantId,
      text,
      mediaAssetId: params.mediaAssetId ?? null,
      // Kept on the idea so the look, photo and reference the owner picked in
      // the studio survive the question we're about to ask them.
      templateId: params.templateId ?? null,
      heroAssetId: params.heroAssetId ?? null,
      styleRefAssetId: params.styleRefAssetId ?? null,
      designSpec: (params.designSpec ?? undefined) as Prisma.InputJsonValue | undefined,
      classification: classified.data.category as IdeaCategory,
      missingInfo,
      status: missingInfo.length > 0 ? "NEEDS_INFO" : "PROPOSED",
      createdById: userId,
    },
  });

  log.info({
    operation: "idea.submit",
    tenantId,
    userId,
    provider: classified.provider,
    status: "ok",
    category: classified.data.category,
    missingInfo: missingInfo.length,
    answered: Boolean(params.extraDetail),
  });

  // Step 2 — stop and ask rather than invent a price or a date.
  if (missingInfo.length > 0) {
    await db.notification.create({
      data: {
        tenantId,
        userId,
        kind: "ai_question",
        title: "I need one more detail",
        body: missingInfo[0],
        href: `/app/_/ideas/${idea.id}`,
      },
    });
    return { idea, missingInfo };
  }

  // Step 3 — build the campaign around the locked facts.
  const campaignId = await generateCampaignForIdea({
    tenantId,
    userId,
    idea,
    ideaText: text,
    facts: classified.data.facts,
    templateId: params.templateId ?? null,
    heroAssetId: params.heroAssetId ?? null,
    styleRefAssetId: params.styleRefAssetId ?? null,
    designSpec: params.designSpec ?? null,
  });

  return { idea, missingInfo: [], campaignId };
}

const CONTENT_TYPE_MAP: Record<string, ContentType> = {
  POST: "POST",
  STORY: "STORY",
  FLYER: "FLYER",
  MESSAGE: "MESSAGE",
  UPDATE: "UPDATE",
  PROMOTION: "PROMOTION",
};

export async function generateCampaignForIdea(params: {
  tenantId: string;
  userId: string;
  idea: Idea;
  ideaText: string;
  facts: Record<string, string | null>;
  templateId?: string | null;
  heroAssetId?: string | null;
  styleRefAssetId?: string | null;
  designSpec?: DesignSpec | null;
}): Promise<string> {
  const { tenantId, userId, idea, ideaText, facts } = params;

  await checkEntitlement(tenantId, "campaigns");
  await checkEntitlement(tenantId, "ai_text");

  const ctx = await buildBusinessContext(tenantId);
  const ai = getAIProvider();
  const prompt = campaignProposalPrompt(ctx, ideaText, facts);

  const proposal = await ai.generateStructured(
    {
      task: "campaign",
      schemaName: PROMPT_VERSIONS.campaignProposal,
      system: prompt.system,
      prompt: prompt.prompt,
    },
    campaignProposalSchema,
  );
  await recordUsage(tenantId, "ai_text");

  const campaignId = await persistProposal({
    tenantId,
    userId,
    ideaId: idea.id,
    category: idea.classification ?? "OTHER",
    facts,
    proposal: proposal.data,
    generatedBy: `${proposal.provider}:${proposal.model}`,
    templateId: params.templateId ?? null,
    heroAssetId: params.heroAssetId ?? null,
    styleRefAssetId: params.styleRefAssetId ?? null,
    designSpec: params.designSpec ?? null,
  });

  // Creatives come with the campaign, not as a separate chore. A flyer
  // failure must not lose the campaign, so it's logged rather than thrown.
  try {
    await createCampaignFlyers({ tenantId, campaignId, userId });
  } catch (err) {
    log.error({
      operation: "campaign.flyers",
      tenantId,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await recordUsage(tenantId, "campaigns");
  await audit({
    tenantId,
    userId,
    action: "campaign.generate",
    targetType: "campaign",
    targetId: campaignId,
    meta: { ideaId: idea.id, items: proposal.data.contentItems.length },
  });

  return campaignId;
}

async function persistProposal(params: {
  tenantId: string;
  userId: string;
  ideaId: string;
  category: IdeaCategory;
  facts: Record<string, string | null>;
  proposal: CampaignProposal;
  generatedBy: string;
  templateId?: string | null;
  heroAssetId?: string | null;
  styleRefAssetId?: string | null;
  designSpec?: DesignSpec | null;
}): Promise<string> {
  const { tenantId, userId, proposal, facts } = params;
  const startsAt = new Date();
  startsAt.setHours(0, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + proposal.durationDays);

  return db.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        tenantId,
        name: proposal.name,
        objective: proposal.objective,
        category: params.category,
        audience: proposal.audience,
        channels: proposal.channels,
        startsAt,
        endsAt,
        status: "PROPOSED",
        facts,
        proposal: { rationale: proposal.rationale, durationDays: proposal.durationDays },
        generatedBy: params.generatedBy,
        promptVersion: PROMPT_VERSIONS.campaignProposal,
        createdById: userId,
        templateId: params.templateId ?? null,
        heroAssetId: params.heroAssetId ?? null,
        styleRefAssetId: params.styleRefAssetId ?? null,
        designSpec: (params.designSpec ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await tx.contentItem.createMany({
      data: proposal.contentItems.map((item) => {
        const when = new Date(startsAt);
        when.setDate(when.getDate() + item.dayOffset);
        const [h, m] = item.timeOfDay.split(":");
        when.setHours(Number(h ?? 18), Number(m ?? 0), 0, 0);
        return {
          tenantId,
          campaignId: campaign.id,
          platform: item.platform,
          contentType: CONTENT_TYPE_MAP[item.contentType] ?? "POST",
          title: item.title,
          body: item.body,
          hook: item.hook,
          cta: item.cta,
          hashtags: item.hashtags,
          scheduledAt: when,
          status: "NEEDS_REVIEW" as const,
          aiGenerated: true,
          generatedBy: params.generatedBy,
          promptVersion: PROMPT_VERSIONS.campaignProposal,
        };
      }),
    });

    await tx.idea.update({
      where: { id: params.ideaId },
      data: { status: "PROPOSED", campaignId: campaign.id, missingInfo: [] },
    });

    await tx.notification.create({
      data: {
        tenantId,
        userId,
        kind: "campaign_ready",
        title: `Campaign ready: ${proposal.name}`,
        body: `${proposal.contentItems.length} pieces waiting for your OK.`,
      },
    });

    return campaign.id;
  });
}
