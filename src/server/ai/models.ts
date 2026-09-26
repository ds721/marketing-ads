import type { AiTask } from "@/server/ai/types";

// ── Cost-aware model routing (§39) ────────────────────────────────────────
// Model names live here and nowhere else. Overridable per-task via env so
// ops can shift cost/quality without a deploy.

export interface ModelConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

const OPENAI_DEFAULTS: Record<AiTask, ModelConfig> = {
  // Cheap + fast: short, highly-constrained outputs
  classify: { model: "gpt-4o-mini", temperature: 0, maxTokens: 700 },
  rewrite: { model: "gpt-4o-mini", temperature: 0.6, maxTokens: 1200 },
  // Mid: creative but bounded
  content: { model: "gpt-4o-mini", temperature: 0.8, maxTokens: 2000 },
  // Strong reasoning: plans the owner will act on
  strategy: { model: "gpt-4o", temperature: 0.7, maxTokens: 4000 },
  campaign: { model: "gpt-4o", temperature: 0.7, maxTokens: 4000 },
  analysis: { model: "gpt-4o", temperature: 0.3, maxTokens: 2000 },
};

const ENV_KEY: Record<AiTask, string> = {
  classify: "AI_MODEL_CLASSIFY",
  rewrite: "AI_MODEL_REWRITE",
  content: "AI_MODEL_CONTENT",
  strategy: "AI_MODEL_STRATEGY",
  campaign: "AI_MODEL_CAMPAIGN",
  analysis: "AI_MODEL_ANALYSIS",
};

// Gemini's free tier is what makes this app usable without a card. Google
// retires model names quickly — gemini-2.0-flash and gemini-2.5-flash are
// both already gone — so every name here is overridable by env, and the
// provider reports the retirement message verbatim when one lapses.
const GEMINI_TEXT = process.env.AI_MODEL_GEMINI ?? "gemini-3.8-flash";

/**
 * Gemini's free quota is 20 requests per model per day, so one exhausted
 * model is not an exhausted account — the next one in this list still
 * answers, and the chain's length is the day's capacity. For a shop owner
 * writing a few posts that is the difference between the app working and the
 * app apologising. Order is best-first; every name is verified against the
 * live model list, since Google retires them quickly.
 */
export const GEMINI_TEXT_CHAIN: string[] = (
  process.env.AI_MODEL_GEMINI_CHAIN ??
  [
    GEMINI_TEXT,
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
  ].join(",")
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean)
  .filter((m, i, a) => a.indexOf(m) === i);
const GEMINI_DEFAULTS: Record<AiTask, ModelConfig> = {
  classify: { model: GEMINI_TEXT, temperature: 0, maxTokens: 700 },
  rewrite: { model: GEMINI_TEXT, temperature: 0.6, maxTokens: 1200 },
  content: { model: GEMINI_TEXT, temperature: 0.8, maxTokens: 2000 },
  strategy: { model: GEMINI_TEXT, temperature: 0.7, maxTokens: 4000 },
  campaign: { model: GEMINI_TEXT, temperature: 0.7, maxTokens: 4000 },
  analysis: { model: GEMINI_TEXT, temperature: 0.3, maxTokens: 2000 },
};

export function modelFor(task: AiTask, provider = "openai"): ModelConfig {
  const base = (provider === "gemini" ? GEMINI_DEFAULTS : OPENAI_DEFAULTS)[task];
  const override = process.env[ENV_KEY[task]];
  return override ? { ...base, model: override } : base;
}

export const IMAGE_MODEL = process.env.AI_MODEL_IMAGE ?? "gpt-image-1";
/**
 * Gemini's image model. Note this is NOT on the free tier — free keys get
 * `limit: 0` for image generation and the call 429s immediately. It works
 * once billing is enabled on the Google Cloud project.
 */
export const GEMINI_IMAGE_MODEL = process.env.AI_MODEL_IMAGE_GEMINI ?? "gemini-3.1-flash-image";
export const GEMINI_VISION_MODEL = process.env.AI_MODEL_VISION_GEMINI ?? GEMINI_TEXT;
