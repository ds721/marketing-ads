import { describe, it, expect } from "vitest";
import { offerNameFrom } from "@/server/ai/providers/mock";

// The offer name becomes the flyer headline, so it has to read as English.
describe("offer name extraction", () => {
  it("cuts the timing clause instead of deleting the day words", () => {
    expect(offerNameFrom("Hair spa offer ₹799 every Tuesday and Wednesday this month")).toBe(
      "Hair spa offer",
    );
  });

  it("keeps a day word that is part of the offer's own name", () => {
    expect(offerNameFrom("Weekend brunch buffet ₹499")).toBe("Weekend brunch buffet");
  });

  it("drops the price", () => {
    expect(offerNameFrom("Filter coffee for ₹40")).toBe("Filter coffee");
  });

  it("handles rupees written as Rs", () => {
    expect(offerNameFrom("Haircut and beard trim Rs 299 this Saturday")).toBe(
      "Haircut and beard trim",
    );
  });

  it("leaves an offer with no price or timing untouched", () => {
    expect(offerNameFrom("Buy one get one free on all cakes")).toBe("Buy one get one free on all cakes");
  });

  it("stops at the first sentence", () => {
    expect(offerNameFrom("New menu launch. Come try it.")).toBe("New menu launch");
  });

  it("never ends on a dangling joiner", () => {
    for (const t of [
      "Diwali sweets box ₹999 every Sunday",
      "Kids haircut ₹150 on Monday",
      "Ladies night this weekend",
    ]) {
      expect(offerNameFrom(t)).not.toMatch(/\b(and|or|for|on|at|from|every|each|all|this|with|only)$/i);
    }
  });

  it("returns null rather than an empty headline", () => {
    expect(offerNameFrom("₹199")).toBeNull();
  });
});

import { weekendWindow } from "@/server/ai/providers/mock";

// Every shape of timing we fail to recognise becomes another question on
// screen, which is the single thing owners complained about most.
describe("timing recognition", () => {
  const days = (t: string) => weekendWindow(t).days;

  it("reads an explicit date range", () => {
    expect(days("Hair spa ₹799, 1 October to 31 October")).toBe("1 October – 31 October");
  });

  it("reads a month-first date", () => {
    expect(days("Launch on Oct 15")).toBe("Oct 15");
  });

  it("reads a numeric date range", () => {
    expect(days("Offer runs 15/10 to 31/10")).toBe("15/10 – 31/10");
  });

  it("reads weekdays the old code ignored", () => {
    expect(days("Hair spa every Tuesday and Wednesday")).toBe("Every Tuesday & Wednesday");
  });

  it("still echoes a single day without widening it", () => {
    expect(days("Filter coffee ₹40 all day Sunday")).toBe("Sunday");
  });

  it("keeps the weekend shorthand", () => {
    expect(days("Brunch this weekend")).toBe("Saturday & Sunday");
  });

  it("recognises daily", () => {
    expect(days("Happy hour daily 5pm")).toBe("Every day");
  });

  it("returns null when no timing was given, so we ask", () => {
    expect(days("New hair spa treatment now available")).toBeNull();
  });

  it("keeps both the weekdays and the dates when the owner gave both", () => {
    expect(days("Every Tuesday and Wednesday, 1 October to 31 October")).toBe(
      "Every Tuesday & Wednesday, 1 October – 31 October",
    );
  });
});
