import { describe, it, expect } from "vitest";
import "./setup";
import { renderFlyerSvg, flyerSpecFromCampaign } from "@/server/creative/flyer";

// ── Deterministic creative rule (§19) ─────────────────────────────────────
// The point of this test: commercial text on a flyer is drawn by our code from
// the stored facts, so it is byte-for-byte what the owner typed.

describe("flyer rendering", () => {
  const spec = flyerSpecFromCampaign({
    campaignName: "Weekend Biryani Offer",
    facts: {
      offerName: "Biryani + Coke combo",
      price: "₹199",
      discount: null,
      startDate: null,
      endDate: null,
      daysOrTimes: "Saturday & Sunday",
    },
    business: { name: "Spice House", phone: "+91 98410 55555", address: "45 T Nagar", city: "Chennai" },
    brand: { primary: "#E8492E", secondary: "#2E2447", accent: "#F5A31C" },
    cta: "Order now",
  });

  it("prints the exact price it was given", () => {
    const svg = renderFlyerSvg(spec, "square");
    expect(svg).toContain("₹199");
    expect(svg).not.toContain("₹1990");
    expect(svg).not.toContain("₹1,999");
  });

  it("includes the business contact details verbatim", () => {
    const svg = renderFlyerSvg(spec, "square");
    expect(svg).toContain("+91 98410 55555");
    expect(svg).toContain("SPICE HOUSE");
    expect(svg).toContain("Saturday &amp; Sunday");
    expect(svg).toContain("Order now");
  });

  it("is deterministic — same input, identical output", () => {
    expect(renderFlyerSvg(spec, "square")).toBe(renderFlyerSvg(spec, "square"));
  });

  it("omits facts the owner never stated rather than inventing them", () => {
    const bare = renderFlyerSvg(
      flyerSpecFromCampaign({
        campaignName: "New dish launch",
        facts: { offerName: null, price: null, discount: null, startDate: null, endDate: null, daysOrTimes: null },
        business: { name: "Spice House", phone: null, address: null, city: null },
        brand: { primary: "#E8492E", secondary: "#2E2447", accent: "#F5A31C" },
        cta: null,
      }),
      "square",
    );
    expect(bare).not.toMatch(/₹/);
    // Long headlines wrap across lines, so assert on the words.
    expect(bare).toContain("NEW DISH");
    expect(bare).toContain("LAUNCH");
  });

  it("escapes text so content can't break the SVG", () => {
    const svg = renderFlyerSvg({ ...spec, headline: 'Deal <script>alert("x")</script>' }, "story");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;SCRIPT&gt;");
  });

  it("renders every supported format", () => {
    for (const format of ["square", "portrait", "story"] as const) {
      const svg = renderFlyerSvg(spec, format);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("</svg>");
    }
  });
});

// ── Templates ─────────────────────────────────────────────────────────────

import { TEMPLATES, renderTemplate, getTemplate } from "@/server/creative/templates";
import { cleanText } from "@/server/creative/svg";

describe("flyer templates", () => {
  const input = {
    headline: "Biryani + Coke combo",
    price: "₹199",
    when: "Saturday & Sunday",
    businessName: "Spice House",
    cta: "Order now",
    phone: "+91 98410 55555",
    address: "45 T Nagar",
    brand: { primary: "#E8492E", secondary: "#2E2447", accent: "#F5A31C" },
  };

  it("offers six distinct looks", () => {
    expect(TEMPLATES).toHaveLength(6);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(6);
  });

  it("every look, every shape, with and without a photo, carries the locked facts", () => {
    const photo = "data:image/jpeg;base64,/9j/4AAQ";
    for (const t of TEMPLATES) {
      for (const format of ["square", "portrait", "story"] as const) {
        for (const p of [null, photo]) {
          const svg = t.render({ ...input, format, photo: p });
          expect(svg.startsWith("<svg"), `${t.id}/${format}`).toBe(true);
          expect(svg, `${t.id}/${format} price`).toContain("₹199");
          expect(svg, `${t.id}/${format} phone`).toContain("+91 98410 55555");
          expect(svg, `${t.id}/${format} cta`).toContain("Order now");
          expect(svg, `${t.id}/${format} when`).toMatch(/Saturday &amp; Sunday|SATURDAY &amp; SUNDAY/);
          expect(svg).not.toContain("₹1990");
        }
      }
    }
  });

  it("falls back to the default look for an unknown id", () => {
    expect(getTemplate("nonsense").id).toBe("bold");
    expect(renderTemplate(undefined, { ...input, format: "square" })).toContain("<svg");
  });

  it("strips the quote marks owners type around an offer", () => {
    expect(cleanText('"We have 50 extra cakes today"')).toBe("We have 50 extra cakes today");
    expect(cleanText("“Weekend special”")).toBe("Weekend special");
    expect(cleanText("  plain   text  ")).toBe("plain text");
  });

  it("escapes markup inside a photo data URI so it can't break the SVG", () => {
    const svg = TEMPLATES[0]!.render({ ...input, format: "square", photo: 'data:x"><script>' });
    expect(svg).not.toContain("<script>");
  });
});
