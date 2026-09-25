import { describe, it, expect, beforeAll } from "vitest";
import { ensureFonts, measure } from "@/server/creative/fonts";
import { fitLabel, fitSize } from "@/server/creative/svg";

// A long timing line ("Every Tuesday & Wednesday, 1 October – 31 October") used
// to run off the canvas and over the call to action. Every template now sizes
// this text to a width budget, so the budget maths has to hold.

const LONG = "EVERY TUESDAY & WEDNESDAY, 1 OCTOBER – 31 OCTOBER";

beforeAll(async () => {
  await ensureFonts();
});

describe("fitting text to a width budget", () => {
  it("shrinks a long line until it fits", () => {
    const max = 900;
    const size = fitSize("body", LONG, 32, max);
    expect(measure("body", LONG, size)).toBeLessThanOrEqual(max);
  });

  it("counts letter spacing, which is what broke the framed look", () => {
    const max = 900;
    const tracking = 13; // ~0.012em on a 1080px canvas
    const naive = fitSize("body", LONG, 30, max); // ignores tracking
    expect(measure("body", LONG, naive, tracking)).toBeGreaterThan(max);

    const fit = fitLabel("body", LONG, 30, max, 0.5, tracking);
    expect(measure("body", LONG, fit.size, fit.letterSpacing)).toBeLessThanOrEqual(max);
  });

  it("scales the tracking down with the type", () => {
    const fit = fitLabel("body", LONG, 30, 600, 0.5, 13);
    expect(fit.size).toBeLessThan(30);
    expect(fit.letterSpacing).toBeLessThan(13);
    expect(fit.letterSpacing).toBeGreaterThan(0);
  });

  it("leaves a short line at full size", () => {
    expect(fitSize("body", "Sunday", 32, 900)).toBe(32);
  });

  it("never shrinks past the floor, however long the text", () => {
    const size = fitSize("body", LONG.repeat(6), 32, 200, 0.6);
    expect(size).toBeGreaterThanOrEqual(Math.round(32 * 0.6));
  });

  it("is a no-op when there is no budget to fit to", () => {
    expect(fitSize("body", LONG, 32, 0)).toBe(32);
  });
});

import { fitHeadlineBox } from "@/server/creative/svg";

// A long headline used to wrap to three lines and shove the price down onto
// the date and the phone number. The headline is the element that must yield.
describe("fitting a headline into a box", () => {
  const LONG = "BUY ONE GET ONE FREE ON ALL CAKES";

  it("stays inside the height it is given", () => {
    const box = 220;
    const fit = fitHeadlineBox(LONG, "condensed", 900, 3, 170, 95, box, 0.95);
    const used = fit.size + (fit.lines.length - 1) * fit.size * 0.95;
    expect(used).toBeLessThanOrEqual(box);
  });

  it("shrinks the type rather than clipping the words", () => {
    const fit = fitHeadlineBox(LONG, "condensed", 900, 3, 170, 95, 220, 0.95);
    expect(fit.lines.join(" ")).toContain("CAKES");
    expect(fit.size).toBeLessThan(170);
  });

  it("keeps full size when there is room", () => {
    const fit = fitHeadlineBox("CAKE DAY", "condensed", 900, 3, 170, 95, 600, 0.95);
    expect(fit.size).toBe(170);
    expect(fit.lines).toHaveLength(1);
  });

  it("drops to fewer lines when the box is very short", () => {
    const fit = fitHeadlineBox(LONG, "condensed", 900, 3, 170, 95, 110, 0.95);
    const used = fit.size + (fit.lines.length - 1) * fit.size * 0.95;
    expect(used).toBeLessThanOrEqual(110 + fit.size * 0.05);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
  });

  it("never returns zero lines", () => {
    const fit = fitHeadlineBox(LONG, "condensed", 900, 3, 170, 95, 10, 0.95);
    expect(fit.lines.length).toBeGreaterThanOrEqual(1);
  });
});
