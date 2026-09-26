import { describe, it, expect } from "vitest";
import {
  campaignContentItemSchema,
  campaignProposalSchema,
  designSpecSchema,
  ideaClassificationSchema,
  platformId,
} from "@/server/ai/schemas";

// Models disagree about the case of enum values — Gemini answers "post" where
// OpenAI answers "POST", and both are following the prompt as they read it.
// Casing is not worth failing an owner's campaign over; an unknown *value*
// still is.

const item = {
  platform: "instagram",
  contentType: "POST",
  title: "T",
  hook: null,
  body: "B",
  cta: null,
  hashtags: [],
  dayOffset: 0,
  timeOfDay: "10:00",
};

describe("enum spelling tolerance", () => {
  it("accepts a lowercase contentType", () => {
    expect(campaignContentItemSchema.safeParse({ ...item, contentType: "post" }).success).toBe(true);
  });

  it("normalises it to the canonical value", () => {
    const r = campaignContentItemSchema.parse({ ...item, contentType: "story" });
    expect(r.contentType).toBe("STORY");
  });

  it("accepts a capitalised platform", () => {
    expect(platformId.parse("Instagram")).toBe("instagram");
  });

  it("matches across separators", () => {
    expect(platformId.parse("Google Business")).toBe("google_business");
    expect(designSpecSchema.shape.layout.parse({ align: "left", stack: "middle", photo: "half right", price: "big" }).photo).toBe("half-right");
  });

  it("still rejects a value that is not in the list", () => {
    expect(campaignContentItemSchema.safeParse({ ...item, contentType: "image" }).success).toBe(false);
    expect(campaignContentItemSchema.safeParse({ ...item, contentType: "tweet" }).success).toBe(false);
  });

  it("normalises an idea category", () => {
    const parsed = ideaClassificationSchema.parse({
      category: "promotion",
      summary: "s",
      facts: { offerName: null, price: null, discount: null, startDate: null, endDate: null, daysOrTimes: null },
      missingInfo: [],
    });
    expect(parsed.category).toBe("PROMOTION");
  });

  it("still requires at least one content item", () => {
    const proposal = {
      name: "n", objective: "o", audience: "a", durationDays: 3,
      channels: ["instagram"], rationale: "r", contentItems: [],
    };
    expect(campaignProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("rejects a malformed time of day", () => {
    expect(campaignContentItemSchema.safeParse({ ...item, timeOfDay: "6pm" }).success).toBe(false);
  });
});
