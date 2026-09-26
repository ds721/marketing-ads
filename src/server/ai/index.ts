import type { AIProvider } from "@/server/ai/types";
import { OpenAIProvider } from "@/server/ai/providers/openai";
import { MockAIProvider } from "@/server/ai/providers/mock";
import { GeminiProvider } from "@/server/ai/providers/gemini";

// ── AI router (§6) ────────────────────────────────────────────────────────
// Callers ask for "the provider"; which one they get is config, not code.

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const configured = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  switch (configured) {
    case "openai":
      cached = new OpenAIProvider();
      break;
    case "gemini":
    case "google":
      cached = new GeminiProvider();
      break;
    case "mock":
      cached = new MockAIProvider();
      break;
    default:
      throw new Error(`Unknown AI_PROVIDER "${configured}". Use "gemini", "openai" or "mock".`);
  }
  return cached;
}

/** True when the app is running on the development stub, not a real model. */
export function isMockAi(): boolean {
  return (process.env.AI_PROVIDER ?? "mock").toLowerCase() === "mock";
}

/** Image generation needs a configured provider; mock returns a placeholder. */
export function isImageGenerationConfigured(): boolean {
  if (isMockAi()) return false;
  const provider = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  if (provider === "gemini" || provider === "google") {
    return Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);
  }
  return Boolean(process.env.OPENAI_API_KEY);
}
