import Link from "next/link";
import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { Card, EmptyState, StatusPill, PlatformBadge, btnStyles } from "@/components/ui";
import { GenerateStrategyButton } from "@/components/strategy-button";
import { ContentRowActions } from "@/components/content-actions";
import { formatDateTime, monthKey, weekDays, cn } from "@/lib/utils";
import type { ContentStatus } from "@prisma/client";

export const metadata = { title: "Calendar" };

const VIEWS = ["month", "week", "list"] as const;
type View = (typeof VIEWS)[number];

/** Campaign items lead with Beet, routine content Saffron, stories Peacock (§ Masala one-spice rule). */
function slotTone(item: { campaignId: string | null; contentType: string; status: ContentStatus }) {
  if (item.status === "PUBLISHED") return "bg-leaf-tint text-leaf-deep border-leaf";
  if (item.status === "FAILED") return "bg-chili-tint text-chili-deep border-chili";
  if (item.campaignId) return "bg-beet-tint text-beet-deep border-beet";
  if (item.contentType === "STORY") return "bg-peacock-tint text-peacock-deep border-peacock";
  return "bg-saffron-tint text-saffron-deep border-saffron";
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ view?: string; filter?: string }>;
}) {
  const { tenant: slug } = await params;
  const { view: viewParam, filter } = await searchParams;
  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : "month";

  const ctx = await requireTenant(slug);
  const canEdit = roleAtLeast(ctx.role, "EDITOR");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const days = weekDays(now);
  const weekStart = days[0]!;
  const weekEnd = new Date(days[6]!);
  weekEnd.setHours(23, 59, 59, 999);

  const range =
    view === "week"
      ? { gte: weekStart, lt: weekEnd }
      : view === "month"
        ? { gte: monthStart, lt: monthEnd }
        : undefined;

  const items = await db.contentItem.findMany({
    where: {
      tenantId: ctx.tenant.id,
      status: filter === "review" ? "NEEDS_REVIEW" : { not: "ARCHIVED" },
      ...(range ? { scheduledAt: range } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });

  const strategy = await db.marketingStrategy.findFirst({
    where: { tenantId: ctx.tenant.id, month: monthKey(), status: "ACTIVE" },
  });

  const byDay = new Map<string, typeof items>();
  for (const item of items) {
    if (!item.scheduledAt) continue;
    const key = item.scheduledAt.toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }

  return (
    <main className="px-6 md:px-10 py-8 max-w-5xl">
      <PageHeader
        title="Your marketing calendar"
        subtitle={strategy?.summary ?? "Here's what we're doing — and when."}
        action={
          <Link href={`/app/${slug}/ideas/new`} className={btnStyles.idea}>
            + New Marketing Idea
          </Link>
        }
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="inline-flex bg-surface-2 rounded-full p-1 gap-0.5 border border-line">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={`/app/${slug}/calendar?view=${v}`}
              className={cn(
                "text-[13px] font-semibold px-4 py-1.5 rounded-full capitalize",
                v === view ? "bg-surface text-ink shadow-soft" : "text-ink-soft hover:text-ink",
              )}
            >
              {v}
            </Link>
          ))}
        </div>
        {filter === "review" && (
          <Link href={`/app/${slug}/calendar`} className="text-[13px] text-beet font-semibold">
            Showing only items needing review — clear filter
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={filter === "review" ? "Nothing waiting on you" : "No plan for this month yet"}
          body={
            filter === "review"
              ? "Every piece has been reviewed. Nice work."
              : "Let the AI build a month of marketing around your goals — then adjust anything you like."
          }
          action={filter === "review" ? undefined : <GenerateStrategyButton slug={slug} />}
        />
      ) : view === "list" ? (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <Card key={item.id} className="flex items-start gap-3">
              <PlatformBadge platform={item.platform} size={28} />
              <div className="flex-1 min-w-0">
                <Link href={`/app/${slug}/content/${item.id}`} className="font-semibold text-sm hover:text-beet">
                  {item.title}
                </Link>
                <p className="text-[13.5px] text-ink-soft line-clamp-2 whitespace-pre-wrap">
                  {item.body || "No copy written yet."}
                </p>
                <div className="text-xs text-ink-faint mt-1">{formatDateTime(item.scheduledAt)}</div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <StatusPill status={item.status} />
                {canEdit && <ContentRowActions slug={slug} item={{ id: item.id, status: item.status, hasBody: Boolean(item.body) }} />}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-2",
            view === "week" ? "grid-cols-2 md:grid-cols-7" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7",
          )}
        >
          {(view === "week"
            ? days
            : Array.from(
                { length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() },
                (_, i) => new Date(now.getFullYear(), now.getMonth(), i + 1),
              )
          ).map((day) => {
            const dayItems = byDay.get(day.toDateString()) ?? [];
            const isToday = day.toDateString() === now.toDateString();
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "bg-surface border rounded-[12px] p-2.5 min-h-[120px]",
                  isToday ? "border-beet" : "border-line",
                )}
              >
                <div
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-[0.08em] mb-2",
                    isToday ? "text-beet" : "text-ink-faint",
                  )}
                >
                  {day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}
                </div>
                {dayItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/app/${slug}/content/${item.id}`}
                    className={cn(
                      "block rounded-[9px] px-2 py-1.5 text-[11.5px] font-semibold leading-snug mb-1.5 border-l-[3px] hover:brightness-95",
                      slotTone(item),
                    )}
                  >
                    <span className="line-clamp-2">{item.title}</span>
                    <span className="block font-medium opacity-75 text-[10.5px] mt-0.5">
                      {item.platform.replace("_", " ")} ·{" "}
                      {item.scheduledAt?.toLocaleTimeString("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
