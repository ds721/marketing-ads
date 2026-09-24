import { describe, it, expect } from "vitest";
import { flyerPrompt, checkFlyerText, containsExactly, type AiFlyerBrief } from "@/server/creative/ai-flyer";

const brief: AiFlyerBrief = {
  headline: "BUY ONE GET ONE FREE",
  subline: "On all cakes",
  price: "₹199",
  when: "This Sunday",
  cta: "Order now",
  businessName: "Sweet Crumb Bakery",
  phone: "+91 98765 43210",
  category: "bakery",
  style: "premium",
  format: "square",
  brand: { primary: "#D6367B", secondary: "#2E2447", accent: "#F5A31C" },
};

const answer = (text: string, misspelled = false) => JSON.stringify({ text, misspelled });

describe("AI flyer art direction", () => {
  it("quotes every string the model must render", () => {
    const p = flyerPrompt(brief);
    for (const s of ["BUY ONE GET ONE FREE", "On all cakes", "₹199", "This Sunday", "Order now", "Sweet Crumb Bakery", "+91 98765 43210"]) {
      expect(p).toContain(`"${s}"`);
    }
  });

  it("forbids inventing commercial facts", () => {
    expect(flyerPrompt(brief)).toMatch(/Do not add any price, discount, date, website/);
  });

  it("asks for a story canvas when the format is story", () => {
    expect(flyerPrompt({ ...brief, format: "story" })).toContain("9:16");
  });
});

describe("painted-text verification", () => {
  it("accepts a flyer that shows the exact price and phone", () => {
    const r = checkFlyerText(answer("BUY ONE GET ONE FREE | ₹199 | This Sunday | +91 98765 43210"), brief);
    expect(r.ok).toBe(true);
  });

  it("ignores spacing differences the model introduces", () => {
    const r = checkFlyerText(answer("₹ 199 | +919876543210"), brief);
    expect(r.ok).toBe(true);
  });

  it("rejects a flyer where the price drifted", () => {
    const r = checkFlyerText(answer("BUY ONE GET ONE FREE | ₹1999 | +91 98765 43210"), brief);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/price/);
  });

  it("rejects a flyer that dropped the price entirely", () => {
    const r = checkFlyerText(answer("BUY ONE GET ONE FREE | +91 98765 43210"), brief);
    expect(r.ok).toBe(false);
  });

  it("rejects a mangled phone number", () => {
    const r = checkFlyerText(answer("₹199 | +91 98765 43211"), brief);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/phone/);
  });

  it("rejects garbled typography even when the numbers are right", () => {
    const r = checkFlyerText(answer("BUY ONE GET ONE FRIE | ₹199 | +91 98765 43210", true), brief);
    expect(r.ok).toBe(false);
  });

  it("refuses when the checker's answer is unreadable", () => {
    expect(checkFlyerText("I can see a cake.", brief).ok).toBe(false);
  });

  it("tolerates a fenced JSON reply", () => {
    const r = checkFlyerText("```json\n" + answer("₹199 | +91 98765 43210") + "\n```", brief);
    expect(r.ok).toBe(true);
  });

  it("passes a brief with no price or phone to check", () => {
    const r = checkFlyerText(answer("GRAND OPENING"), { ...brief, price: null, phone: null });
    expect(r.ok).toBe(true);
  });
});

describe("whole-number matching", () => {
  it("does not accept ₹1999 as ₹199", () => {
    expect(containsExactly("cake ₹1999 today", "₹199")).toBe(false);
  });
  it("does not accept ₹199 as ₹1990", () => {
    expect(containsExactly("cake ₹199 today", "₹1990")).toBe(false);
  });
  it("accepts the number at the very end of the text", () => {
    expect(containsExactly("only ₹199", "₹199")).toBe(true);
  });
  it("accepts a phone the designer spaced out differently", () => {
    expect(containsExactly("call +91-98765-43210", "+91 98765 43210")).toBe(true);
  });
  it("still matches non-numeric text that abuts a digit", () => {
    expect(containsExactly("2 for Order now", "Order now")).toBe(true);
  });
});
