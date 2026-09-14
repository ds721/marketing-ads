import type { AIProvider } from "@/server/ai/types";
import { OpenAIProvider } from "@/server/ai/providers/openai";
import { MockAIProvider } from "@/server/ai/providers/mock";

// ── AI router (§6) ────────────────────────────────────────────────────────
// Callers ask for "the provider"; which one they get is config, not code.
// Gemini slots in here without touching a single service.

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const configured = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  switch (configured) {
    case "openai":
      cached = new OpenAIProvider();
      break;
    case "mock":
      cached = new MockAIProvider();
      break;
    default:
      throw new Error(`Unknown AI_PROVIDER "${configured}". Use "openai" or "mock".`);
  }
  return cached;
}

/** True when the app is running on the development stub, not a real model. */
export function isMockAi(): boolean {
  return (process.env.AI_PROVIDER ?? "mock").toLowerCase() === "mock";
}

/** Image generation needs a configured provider; mock returns a placeholder. */
export function isImageGenerationConfigured(): boolean {
  return !isMockAi() && Boolean(process.env.OPENAI_API_KEY);
}
