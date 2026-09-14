import { describe, it, expect } from "vitest";
import "./setup";
import { MockAIProvider } from "@/server/ai/providers/mock";
import {
  campaignProposalSchema,
  ideaClassificationSchema,
  monthlyStrategySchema,
  PROMPT_VERSIONS,
} from "@/server/ai/schemas";
import { z } from "zod";
import { AiOutputInvalidError } from "@/server/ai/types";

// ── Structured AI output (§40) and anti-invention guardrails (§42) ────────

const provider = new MockAIProvider();

function promptWith(ctx: Record<string, unknown>): string {
  return `Do the thing.\n\nBUSINESS CONTEXT (JSON):\n${JSON.stringify(ctx)}`;
}

describe("AI structured output", () => {
  it("rejects output that doesn't satisfy the schema", async () => {
    // A schema the mock's template can never satisfy.
    const impossible = z.object({ somethingElseEntirely: z.string() });
    await expect(
      provider.generateStructured(
        {
          task: "classify",
          schemaName: PROMPT_VERSIONS.ideaClassification,
          system: "s",
          prompt: promptWith({ idea: { text: "test" } }),
        },
        impossible,
      ),
    ).rejects.toBeInstanceOf(AiOutputInvalidError);
  });

  it("classifies an offer and copies the price verbatim", async () => {
    const result = await provider.generateStructured(
      {
        task: "classify",
        schemaName: PROMPT_VERSIONS.ideaClassification,
        system: "s",
        prompt: promptWith({
          business: { name: "Spice House", city: "Chennai" },
          idea: { text: "Biryani + Coke combo for ₹199 this weekend" },
        }),
      },
      ideaClassificationSchema,
    );

    expect(result.data.category).toBe("PROMOTION");
    expect(result.data.facts.price).toBe("₹199");
    expect(result.data.facts.daysOrTimes).toBe("Saturday & Sunday");
    expect(result.data.missingInfo).toHaveLength(0);
  });

  it("asks for a missing price instead of inventing one", async () => {
    const result = await provider.generateStructured(
      {
        task: "classify",
        schemaName: PROMPT_VERSIONS.ideaClassification,
        system: "s",
        prompt: promptWith({ idea: { text: "We have a special combo offer this weekend" } }),
      },
      ideaClassificationSchema,
    );

    expect(result.data.facts.price).toBeNull();
    expect(result.data.missingInfo.length).toBeGreaterThan(0);
    expect(result.data.missingInfo[0]).toMatch(/price|discount/i);
  });

  it("builds platform-specific copy, not one text repeated", async () => {
    const result = await provider.generateStructured(
      {
        task: "campaign",
        schemaName: PROMPT_VERSIONS.campaignProposal,
        system: "s",
        prompt: promptWith({
          business: { name: "Spice House", city: "Chennai" },
          brand: { cta: "Order now" },
          idea: { text: "Biryani + Coke combo for ₹199 this weekend" },
          platforms: ["instagram", "facebook", "whatsapp"],
          goals: ["Increase sales"],
        }),
      },
      campaignProposalSchema,
    );

    expect(result.data.contentItems.length).toBeGreaterThan(2);
    const bodies = result.data.contentItems.map((i) => i.body);
    expect(new Set(bodies).size).toBeGreaterThan(1);

    // The stated price appears; no other rupee figure is introduced.
    for (const item of result.data.contentItems) {
      const amounts = item.body.match(/₹[\d,]+/g) ?? [];
      for (const a of amounts) expect(a).toBe("₹199");
    }
  });

  it("reads the business context even when the prompt carries an earlier JSON block", async () => {
    // Regression: the campaign prompt includes LOCKED FACTS before the context.
    // Spanning from the first brace captured both blocks and parsed as nothing,
    // which silently replaced real business details with placeholders.
    const prompt = `The owner said: "Biryani + Coke combo for ₹199 this weekend"

LOCKED FACTS (use verbatim):
${JSON.stringify({ price: "₹199", daysOrTimes: "Saturday & Sunday" })}

BUSINESS CONTEXT (JSON):
${JSON.stringify({
      business: { name: "Spice House", city: "Chennai" },
      brand: { cta: "Order now" },
      idea: { text: "Biryani + Coke combo for ₹199 this weekend" },
      platforms: ["instagram", "facebook"],
      goals: ["Increase sales"],
    })}`;

    const result = await provider.generateStructured(
      { task: "campaign", schemaName: PROMPT_VERSIONS.campaignProposal, system: "s", prompt },
      campaignProposalSchema,
    );

    expect(result.data.objective).toContain("Chennai");
    const facebook = result.data.contentItems.find((i) => i.platform === "facebook");
    expect(facebook?.body).toContain("Spice House");
    expect(facebook?.body).toContain("₹199");
    expect(result.data.contentItems.every((i) => !i.body.includes("our shop"))).toBe(true);
  });

  it("produces a month of weeks that satisfy the strategy schema", async () => {
    const result = await provider.generateStructured(
      {
        task: "strategy",
        schemaName: PROMPT_VERSIONS.monthlyStrategy,
        system: "s",
        prompt: promptWith({
          business: { name: "Glow Salon" },
          products: [{ name: "Hair spa" }, { name: "Facial" }],
          goals: ["Increase bookings"],
          platforms: ["instagram", "facebook"],
        }),
      },
      monthlyStrategySchema,
    );

    expect(result.data.weeks).toHaveLength(4);
    expect(result.data.weeks.every((w) => w.items.length > 0)).toBe(true);
  });
});
