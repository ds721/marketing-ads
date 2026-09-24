import type { z } from "zod";

// ── AI provider abstraction (spec §6) ─────────────────────────────────────
// The app only ever talks to AIProvider. Concrete providers (OpenAI, Gemini,
// Mock) live in ./providers. Model choice is the router's job, not callers'.

export type AiTask =
  | "classify" // cheap/fast
  | "rewrite" // fast
  | "strategy" // strong reasoning
  | "campaign" // strong reasoning
  | "content" // mid
  | "analysis"; // reasoning

export interface TextGenerationInput {
  task: AiTask;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TextGenerationResult {
  text: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface StructuredGenerationInput extends TextGenerationInput {
  schemaName: string;
}

export interface ImageGenerationInput {
  prompt: string;
  size?: "square" | "portrait" | "story";
  /**
   * Reference images the model composes from — the owner's product photo.
   * With these the model edits rather than invents, so the cake on the flyer
   * is their cake.
   */
  references?: Buffer[];
  /** Higher quality costs more and takes longer; worth it for a flyer. */
  quality?: "low" | "medium" | "high";
}

export interface ImageGenerationResult {
  /** PNG bytes */
  data: Buffer;
  model: string;
  provider: string;
}

export class AiNotConfiguredError extends Error {
  constructor(provider: string) {
    super(
      `AI provider "${provider}" is not configured. Set the API key in .env, or use AI_PROVIDER=mock for development.`,
    );
    this.name = "AiNotConfiguredError";
  }
}

/** The provider account itself is the problem: no credit, or rate-limited. */
export class AiQuotaError extends Error {
  constructor(
    public provider: string,
    public reason: "no_credit" | "rate_limited",
  ) {
    super(
      reason === "no_credit"
        ? `${provider} account has no credit left. Add credit on the provider's billing page.`
        : `${provider} is rate-limiting requests right now. Try again in a minute.`,
    );
    this.name = "AiQuotaError";
  }
}

export class AiOutputInvalidError extends Error {
  constructor(schemaName: string, detail: string) {
    super(`AI returned output that failed ${schemaName} validation: ${detail}`);
    this.name = "AiOutputInvalidError";
  }
}

export interface AIProvider {
  readonly name: string;
  generateText(input: TextGenerationInput): Promise<TextGenerationResult>;
  /** Structured output validated against a zod schema before it's returned. */
  generateStructured<T>(input: StructuredGenerationInput, schema: z.ZodType<T>): Promise<{ data: T; model: string; provider: string }>;
  generateImage(input: ImageGenerationInput): Promise<ImageGenerationResult>;
  /**
   * Reads an image and answers a question about it. Used to verify that the
   * price and phone number a model painted onto a flyer are the ones the
   * owner actually gave us.
   */
  readImage(input: { image: Buffer; question: string }): Promise<string>;
}
