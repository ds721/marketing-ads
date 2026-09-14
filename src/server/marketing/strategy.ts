import { db } from "@/server/db";
import { getAIProvider } from "@/server/ai";
import { buildBusinessContext } from "@/server/ai/context";
import { monthlyStrategyPrompt } from "@/server/ai/prompts";
import { monthlyStrategySchema, PROMPT_VERSIONS } from "@/server/ai/schemas";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { audit } from "@/server/audit";
import type { ContentType } from "@prisma/client";

// ── Always-on marketing engine (§10–11) ───────────────────────────────────
// Produces the month's plan and materialises it as calendar items the owner
// can review. Learnings from past results feed the next month's plan (§26).

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

/** Plain-language summary of what worked, fed into the next strategy (§26). */
async function learningsFor(tenantId: string): Promise<string | undefined> {
  const insights = await db.aiInsight.findMany({
    where: { tenantId, kind: "insight" },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  if (insights.length === 0) return undefined;
  return insights.map((i) => `- ${i.title}: ${i.body}`).join("\n");
}

export async function generateMonthlyStrategy(params: {
  tenantId: string;
  userId: string;
  month: string; // "2026-09"
}): Promise<string> {
  const { tenantId, userId, month } = params;

  await checkEntitlement(tenantId, "ai_text");
  const ctx = await buildBusinessContext(tenantId);
  const ai = getAIProvider();
  const prompt = monthlyStrategyPrompt(ctx, monthLabel(month), await learningsFor(tenantId));

  const result = await ai.generateStructured(
    {
      task: "strategy",
      schemaName: PROMPT_VERSIONS.monthlyStrategy,
      system: prompt.system,
      prompt: prompt.prompt,
    },
    monthlyStrategySchema,
  );
  await recordUsage(tenantId, "ai_text");

  const generatedBy = `${result.provider}:${result.model}`;

  const strategyId = await db.$transaction(async (tx) => {
    // Supersede any earlier plan for the same month.
    await tx.marketingStrategy.updateMany({
      where: { tenantId, month, status: { in: ["PROPOSED", "ACTIVE"] } },
      data: { status: "ARCHIVED" },
    });

    const strategy = await tx.marketingStrategy.create({
      data: {
        tenantId,
        month,
        summary: result.data.summary,
        focus: result.data.focus,
        weeks: result.data.weeks,
        status: "ACTIVE",
        generatedBy,
        promptVersion: PROMPT_VERSIONS.monthlyStrategy,
      },
    });

    // Materialise the plan as dated calendar items the owner can review.
    const [year, monthNum] = month.split("-").map(Number);
    const firstOfMonth = new Date(year ?? 2026, (monthNum ?? 1) - 1, 1);
    const items: Array<{
      tenantId: string;
      strategyId: string;
      platform: string;
      contentType: ContentType;
      title: string;
      body: string;
      scheduledAt: Date;
      status: "DRAFT";
      aiGenerated: boolean;
      generatedBy: string;
      promptVersion: string;
    }> = [];

    for (const week of result.data.weeks) {
      for (const item of week.items) {
        // Monday-first offset within the month.
        const mondayOffset = (8 - (firstOfMonth.getDay() || 7)) % 7;
        const when = new Date(firstOfMonth);
        when.setDate(1 + mondayOffset + (week.week - 1) * 7 + item.dayOfWeek);
        when.setHours(18, 0, 0, 0);
        if (when.getMonth() !== (monthNum ?? 1) - 1) continue; // don't spill into next month

        items.push({
          tenantId,
          strategyId: strategy.id,
          platform: item.platform,
          contentType: item.contentType as ContentType,
          title: item.topic,
          // Copy is written later, on demand, by the content service — the
          // strategy only fixes topic, platform and timing.
          body: item.angle ?? "",
          scheduledAt: when,
          status: "DRAFT" as const,
          aiGenerated: true,
          generatedBy,
          promptVersion: PROMPT_VERSIONS.monthlyStrategy,
        });
      }
    }

    if (items.length > 0) await tx.contentItem.createMany({ data: items });

    await tx.notification.create({
      data: {
        tenantId,
        userId,
        kind: "campaign_ready",
        title: `${monthLabel(month)} plan is ready`,
        body: result.data.summary.slice(0, 160),
      },
    });

    return strategy.id;
  });

  await audit({
    tenantId,
    userId,
    action: "strategy.generate",
    targetType: "strategy",
    targetId: strategyId,
    meta: { month },
  });

  return strategyId;
}
