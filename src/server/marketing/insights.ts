import { db } from "@/server/db";
import { getAIProvider } from "@/server/ai";
import { buildBusinessContext } from "@/server/ai/context";
import { analyticsInsightPrompt } from "@/server/ai/prompts";
import { insightSchema, PROMPT_VERSIONS } from "@/server/ai/schemas";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { audit } from "@/server/audit";
import type { Prisma } from "@prisma/client";

// ── AI optimisation loop (§25–26) ─────────────────────────────────────────
// Results → analysis → recommendation → next month's strategy. The learnings
// produced here are read back by generateMonthlyStrategy().

export interface PerformanceRow {
  topic: string;
  reach: number;
  engagement: number;
  bookings: number;
}

/** Groups published content by topic and joins it to collected platform metrics. */
export async function performanceByTopic(tenantId: string, days = 30): Promise<PerformanceRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const published = await db.contentItem.findMany({
    where: { tenantId, status: "PUBLISHED", publishedAt: { gte: since } },
    select: { id: true, title: true, platform: true, publishedAt: true, campaignId: true },
  });
  if (published.length === 0) return [];

  const snapshots = await db.analyticsSnapshot.findMany({
    where: { tenantId, date: { gte: since } },
  });

  // Until per-post metrics are available from a platform, attribute each day's
  // totals to the content published that day. Honest and directionally useful.
  const byDate = new Map<string, { reach: number; engagement: number; bookings: number }>();
  for (const s of snapshots) {
    const key = s.date.toISOString().slice(0, 10);
    const prev = byDate.get(key) ?? { reach: 0, engagement: 0, bookings: 0 };
    byDate.set(key, {
      reach: prev.reach + s.reach,
      engagement: prev.engagement + s.engagement,
      bookings: prev.bookings + s.bookings,
    });
  }

  const rows = new Map<string, PerformanceRow>();
  for (const item of published) {
    const key = item.publishedAt?.toISOString().slice(0, 10) ?? "";
    const metrics = byDate.get(key) ?? { reach: 0, engagement: 0, bookings: 0 };
    // Topic = the first few words of the title, which is how owners think of it.
    const topic = item.title.split(/[—:\-–]/)[0]!.trim().slice(0, 60) || item.title.slice(0, 60);
    const prev = rows.get(topic) ?? { topic, reach: 0, engagement: 0, bookings: 0 };
    rows.set(topic, {
      topic,
      reach: prev.reach + metrics.reach,
      engagement: prev.engagement + metrics.engagement,
      bookings: prev.bookings + metrics.bookings,
    });
  }

  return [...rows.values()].sort((a, b) => b.engagement - a.engagement).slice(0, 8);
}

export async function generateInsights(params: {
  tenantId: string;
  userId?: string;
}): Promise<number> {
  const { tenantId, userId } = params;
  const rows = await performanceByTopic(tenantId);
  if (rows.length === 0) return 0;

  await checkEntitlement(tenantId, "ai_text");
  const ctx = await buildBusinessContext(tenantId);
  const prompt = analyticsInsightPrompt(ctx, rows);

  const result = await getAIProvider().generateStructured(
    {
      task: "analysis",
      schemaName: PROMPT_VERSIONS.analyticsInsight,
      system: prompt.system,
      prompt: prompt.prompt,
    },
    insightSchema,
  );
  await recordUsage(tenantId, "ai_text");

  await db.$transaction([
    // Supersede the previous batch so the dashboard shows current thinking.
    db.aiInsight.updateMany({
      where: { tenantId, status: "NEW" },
      data: { status: "DISMISSED" },
    }),
    db.aiInsight.createMany({
      data: result.data.insights.map((i) => ({
        tenantId,
        kind: i.kind,
        title: i.title,
        body: i.body,
        data: { rows: rows as unknown as Prisma.InputJsonValue },
      })),
    }),
    db.notification.create({
      data: {
        tenantId,
        userId,
        kind: "insight",
        title: "New marketing insight",
        body: result.data.insights[0]?.title ?? "",
      },
    }),
  ]);

  await audit({ tenantId, userId, action: "insights.generate", meta: { count: result.data.insights.length } });
  return result.data.insights.length;
}
