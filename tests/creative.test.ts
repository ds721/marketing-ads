import { describe, it, expect, beforeAll } from "vitest";
import "./setup";
import { renderFlyerSvg, flyerSpecFromCampaign } from "@/server/creative/flyer";
import { ensureFonts } from "@/server/creative/fonts";

// Text is rendered as vector outlines from bundled fonts, so assertions read
// the <desc> metadata (the locked facts, verbatim) rather than text nodes.
beforeAll(async () => {
  await ensureFonts();
});

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

  it("prints the exact price it was given, as outlines", () => {
    const svg = renderFlyerSvg(spec, "square");
    expect(svg).toContain("<desc>");
    expect(svg).toMatch(/<desc>[^<]*₹199/);
    expect(svg).not.toContain("₹1990");
    expect(svg).not.toContain("₹1,999");
    // Real glyph outlines, not <text> fallbacks.
    expect(svg).toContain("<path d=");
    expect(svg).not.toContain("<text ");
  });

  it("includes the business contact details verbatim", () => {
    const svg = renderFlyerSvg(spec, "square");
    const desc = svg.match(/<desc>([^<]*)<\/desc>/)?.[1] ?? "";
    expect(desc).toContain("+91 98410 55555");
    expect(desc).toContain("Saturday &amp; Sunday");
    expect(desc).toContain("Order now");
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
    expect(bare).toMatch(/<title>New dish launch<\/title>/);
  });

  it("escapes text so content can't break the SVG", () => {
    const svg = renderFlyerSvg({ ...spec, headline: 'Deal <script>alert("x")</script>' }, "story");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
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
          const desc = svg.match(/<desc>([^<]*)<\/desc>/)?.[1] ?? "";
          expect(desc, `${t.id}/${format} price`).toContain("₹199");
          expect(desc, `${t.id}/${format} phone`).toContain("+91 98410 55555");
          expect(desc, `${t.id}/${format} cta`).toContain("Order now");
          expect(desc, `${t.id}/${format} when`).toContain("Saturday &amp; Sunday");
          expect(svg).not.toContain("NaN");
          expect(svg, `${t.id}/${format} outlines`).toContain("<path d=");
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

// ── AI photo prompts ──────────────────────────────────────────────────────

import { photoPrompt } from "@/server/creative/generate-photo";

describe("AI photo prompt", () => {
  it("names the subject and the business type, and forbids text in the image", () => {
    const p = photoPrompt("filter coffee in a steel tumbler", "Restaurant", "warm");
    expect(p).toContain("filter coffee in a steel tumbler");
    expect(p).toContain("restaurant");
    expect(p).toMatch(/no text, letters, numbers/i);
  });

  it("changes with the style", () => {
    expect(photoPrompt("cake", null, "moody")).not.toBe(photoPrompt("cake", null, "clean"));
  });
});

// ── AI design engine ──────────────────────────────────────────────────────

import { renderDesign } from "@/server/creative/design-renderer";
import { designSetSchema, designSpecSchema, PROMPT_VERSIONS } from "@/server/ai/schemas";
import { MockAIProvider } from "@/server/ai/providers/mock";

describe("AI-designed flyers", () => {
  const base = {
    headline: "We have 50 extra cakes today",
    price: "₹199",
    when: "Saturday & Sunday",
    businessName: "Spice House",
    category: "Bakery",
    cta: "Order now",
    phone: "+91 98410 55555",
    address: "45 T Nagar High Road",
    brand: { primary: "#E8492E", secondary: "#2E2447", accent: "#F5A31C" },
  };

  async function designs(hasPhoto: boolean) {
    const r = await new MockAIProvider().generateStructured(
      { task: "campaign", schemaName: PROMPT_VERSIONS.flyerDesign, system: "", prompt: `BUSINESS CONTEXT (JSON):\n${JSON.stringify({ brand: { colors: base.brand }, hasPhoto })}` },
      designSetSchema,
    );
    return r.data.designs;
  }

  it("the model's design must validate before it is ever drawn", () => {
    expect(designSpecSchema.safeParse({ name: "x" }).success).toBe(false);
    // Markup in a colour field is rejected, not rendered.
    expect(designSpecSchema.safeParse({ ...{}, palette: { background: "<script>" } }).success).toBe(false);
  });

  it("every design, every shape, with and without a photo, fits and carries the locked facts", async () => {
    const photo = "data:image/jpeg;base64,/9j/4AAQ";
    for (const hasPhoto of [true, false]) {
      for (const spec of await designs(hasPhoto)) {
        for (const format of ["square", "portrait", "story"] as const) {
          const svg = renderDesign(spec, { ...base, format, photo: hasPhoto ? photo : null });
          const desc = svg.match(/<desc>([^<]*)<\/desc>/)?.[1] ?? "";
          expect(desc, `${spec.name}/${format}`).toContain("₹199");
          expect(desc).toContain("+91 98410 55555");
          expect(svg).not.toContain("NaN");
          expect(svg).toContain("<path d=");
        }
      }
    }
  });

  it("guarantees readable text even when the model picks a bad colour", () => {
    const bad = {
      name: "Low contrast", mood: "x",
      palette: { background: "#FFFFFF", background2: "#FFFFFF", text: "#FAFAFA", accent: "#F5A31C", accent2: "#F5A31C" },
      background: { kind: "solid" as const },
      shapes: [],
      typography: { headline: "display" as const, body: "body" as const, headlineCase: "title" as const, headlineScale: 1 },
      layout: { align: "left" as const, stack: "middle" as const, photo: "none" as const, price: "big" as const },
      decor: "none" as const,
      backgroundPrompt: null,
    };
    const svg = renderDesign(bad, { ...base, format: "square", photo: null });
    // Near-white text on white was swapped for near-black.
    expect(svg).toContain('fill="#1B1430"');
    expect(svg).not.toContain('fill="#FAFAFA"');
  });
});
