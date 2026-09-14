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
