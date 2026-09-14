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

export function modelFor(task: AiTask): ModelConfig {
  const base = OPENAI_DEFAULTS[task];
  const override = process.env[ENV_KEY[task]];
  return override ? { ...base, model: override } : base;
}

export const IMAGE_MODEL = process.env.AI_MODEL_IMAGE ?? "gpt-image-1";
