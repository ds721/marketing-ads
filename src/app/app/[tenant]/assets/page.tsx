import { requireTenant, roleAtLeast } from "@/server/tenant";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Pill } from "@/components/ui";
import { AssetUploader, DeleteAssetButton } from "@/components/asset-forms";
import { getRemainingUsage } from "@/server/usage";

export const metadata = { title: "Assets" };

export default async function AssetsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await requireTenant(slug);
  const canEdit = roleAtLeast(ctx.role, "EDITOR");

  const [assets, storage] = await Promise.all([
    db.asset.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    getRemainingUsage(ctx.tenant.id, "storage_mb"),
  ]);

  return (
    <main className="px-6 md:px-10 py-8 max-w-5xl">
      <PageHeader
        title="Your assets"
        subtitle="Photos, videos and the flyers Markit makes for you. Only your business can see these."
        action={<Pill tone="leaf">{storage.used} / {storage.limit} MB used</Pill>}
      />

      {canEdit && <AssetUploader slug={slug} />}

      {assets.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Upload a few photos of your products, your shop or your happy customers — the AI uses them in your posts."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-6">
          {assets.map((a) => (
            <figure
              key={a.id}
              className="bg-surface border border-line rounded-[14px] overflow-hidden shadow-soft"
            >
              <div className="aspect-square bg-surface-2 flex items-center justify-center overflow-hidden">
                {a.kind === "VIDEO" ? (
                  <span className="text-ink-faint text-sm font-semibold">Video</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/assets/${a.id}`}
                    alt={a.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              <figcaption className="px-3 py-2.5">
                <div className="text-[12.5px] font-semibold truncate">{a.filename}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-ink-faint">
                    {a.kind === "FLYER" ? "Made by Markit" : `${Math.round(a.sizeBytes / 1024)} KB`}
                  </span>
                  {canEdit && <DeleteAssetButton slug={slug} assetId={a.id} />}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </main>
  );
}
