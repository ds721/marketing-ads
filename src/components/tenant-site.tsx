import { formatINR } from "@/lib/utils";
import type { SiteData } from "@/server/site";

// The public marketing page for one business. Rendered identically whether the
// visitor arrived via /site/{slug} or the tenant's own verified domain.

export function TenantSite({ tenant }: { tenant: SiteData }) {

  const p = tenant.businessProfile;
  const b = tenant.brandSettings;
  const primary = b?.primaryColor ?? "#D6367B";
  const secondary = b?.secondaryColor ?? "#2E2447";
  const accent = b?.accentColor ?? "#F5A31C";
  const services = tenant.products.filter((x) => x.kind === "SERVICE");
  const goods = tenant.products.filter((x) => x.kind === "PRODUCT");

  // Structured data for local-business search results (§43).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: tenant.name,
    description: b?.brandDescription ?? p?.aboutRaw ?? undefined,
    telephone: p?.phone ?? undefined,
    email: p?.email ?? undefined,
    url: p?.website ?? undefined,
    address: p?.address
      ? { "@type": "PostalAddress", streetAddress: p.address, addressLocality: p.city ?? undefined }
      : undefined,
  };

  return (
    <div style={{ background: "#fff", color: secondary, minHeight: "100vh" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header
        style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, color: "#fff" }}
        className="px-6 py-16 md:py-24"
      >
        <div className="max-w-4xl mx-auto">
          <h1 className="text-[clamp(34px,6vw,58px)] font-extrabold leading-[1.05] mb-4">
            {tenant.name}
          </h1>
          {(b?.brandDescription || p?.aboutRaw) && (
            <p className="text-lg md:text-xl max-w-[56ch] opacity-95">
              {b?.brandDescription ?? p?.aboutRaw}
            </p>
          )}
          <div className="flex flex-wrap gap-3 mt-8">
            {p?.phone && (
              <a
                href={`tel:${p.phone}`}
                style={{ background: accent, color: secondary }}
                className="font-bold px-6 py-3 rounded-full"
              >
                {b?.ctaPreference ?? "Call us"}
              </a>
            )}
            {p?.website && (
              <a
                href={p.website}
                className="font-bold px-6 py-3 rounded-full border-2 border-white/60"
              >
                Visit website
              </a>
            )}
          </div>
        </div>
      </header>

      {tenant.offers.length > 0 && (
        <section className="px-6 py-12" style={{ background: `${accent}22` }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-extrabold mb-5">What&apos;s on right now</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {tenant.offers.map((o) => (
                <div key={o.id} className="bg-white rounded-2xl p-5 shadow-sm">
                  <div className="font-bold text-lg">{o.title}</div>
                  {o.description && <p className="text-sm opacity-70 mt-1">{o.description}</p>}
                  {o.price && (
                    <div className="text-2xl font-extrabold mt-2" style={{ color: primary }}>
                      {formatINR(Number(o.price))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {[
        { title: "What we offer", items: services },
        { title: "Our products", items: goods },
      ]
        .filter((s) => s.items.length > 0)
        .map((section) => (
          <section key={section.title} className="px-6 py-12">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-extrabold mb-5">{section.title}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.items.map((item) => (
                  <div key={item.id} className="border rounded-2xl p-5" style={{ borderColor: `${secondary}22` }}>
                    <div className="font-bold">{item.name}</div>
                    {item.description && <p className="text-sm opacity-70 mt-1">{item.description}</p>}
                    {item.price && (
                      <div className="font-extrabold mt-2" style={{ color: primary }}>
                        {formatINR(Number(item.price))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

      <footer className="px-6 py-12" style={{ background: secondary, color: "#fff" }}>
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-6">
          <div>
            <div className="font-extrabold text-xl mb-2">{tenant.name}</div>
            {p?.address && <p className="opacity-80 text-sm">{p.address}</p>}
            {p?.city && <p className="opacity-80 text-sm">{p.city}</p>}
          </div>
          <div className="sm:text-right text-sm opacity-80">
            {p?.phone && <div>{p.phone}</div>}
            {p?.email && <div>{p.email}</div>}
          </div>
        </div>
      </footer>
    </div>
  );
}
