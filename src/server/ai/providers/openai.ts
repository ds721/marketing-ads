import type { z } from "zod";
import {
  AiNotConfiguredError,
  AiOutputInvalidError,
  AiQuotaError,
  type AIProvider,
  type ImageGenerationInput,
  type ImageGenerationResult,
  type StructuredGenerationInput,
  type TextGenerationInput,
  type TextGenerationResult,
} from "@/server/ai/types";
import { modelFor, IMAGE_MODEL } from "@/server/ai/models";
import { log } from "@/server/logger";

const API = "https://api.openai.com/v1";
const TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  private apiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new AiNotConfiguredError("openai");
    return key;
  }

  /** POST with timeout + retry on transient failures (429/5xx/network). */
  private async request<T>(path: string, body: unknown, operation: string): Promise<T> {
    const key = this.apiKey();
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${API}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.ok) {
          const json = (await res.json()) as T;
          log.info({ operation, provider: this.name, status: "ok", durationMs: Date.now() - started });
          return json;
        }

        lastError = `HTTP ${res.status}`;
        if (res.status === 429) {
          // Two very different 429s: out of credit (never recovers on retry)
          // vs. a momentary rate limit (does).
          const body = (await res.json().catch(() => ({}))) as { error?: { type?: string; code?: string } };
          const code = body.error?.code ?? body.error?.type ?? "";
          if (/insufficient_quota|credit_balance_exhausted|billing/.test(code)) {
            log.error({ operation, provider: this.name, status: "error", error: "no_credit" });
            throw new AiQuotaError("OpenAI", "no_credit");
          }
          if (attempt === MAX_ATTEMPTS) throw new AiQuotaError("OpenAI", "rate_limited");
        } else if (res.status < 500) {
          // Other 4xx won't succeed on retry.
          const detail = await res.text();
          log.error({ operation, provider: this.name, status: "error", error: lastError, durationMs: Date.now() - started });
          throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
        }
      } catch (err) {
        if (err instanceof AiQuotaError) throw err;
        if (err instanceof Error && /OpenAI request failed/.test(err.message)) throw err;
        lastError = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
      } finally {
        clearTimeout(timer);
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
      }
    }

    log.error({ operation, provider: this.name, status: "error", error: lastError });
    throw new Error(`OpenAI request failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
  }

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    const cfg = modelFor(input.task);
    const json = await this.request<ChatResponse>(
      "/chat/completions",
      {
        model: cfg.model,
        temperature: input.temperature ?? cfg.temperature,
        max_tokens: input.maxTokens ?? cfg.maxTokens,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
      },
      `ai.text.${input.task}`,
    );

    return {
      text: json.choices?.[0]?.message?.content ?? "",
      model: cfg.model,
      provider: this.name,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
  }

  async generateStructured<T>(
    input: StructuredGenerationInput,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; model: string; provider: string }> {
    const cfg = modelFor(input.task);
    const json = await this.request<ChatResponse>(
      "/chat/completions",
      {
        model: cfg.model,
        temperature: input.temperature ?? cfg.temperature,
        max_tokens: input.maxTokens ?? cfg.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
      },
      `ai.structured.${input.schemaName}`,
    );

    const raw = json.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AiOutputInvalidError(input.schemaName, "response was not valid JSON");
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new AiOutputInvalidError(
        input.schemaName,
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400),
      );
    }
    return { data: result.data, model: cfg.model, provider: this.name };
  }

  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const size = input.size === "square" ? "1024x1024" : "1024x1536";
    const json = await this.request<{ data?: Array<{ b64_json?: string }> }>(
      "/images/generations",
      { model: IMAGE_MODEL, prompt: input.prompt, size, n: 1 },
      "ai.image",
    );
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image provider returned no image data.");
    return { data: Buffer.from(b64, "base64"), model: IMAGE_MODEL, provider: this.name };
  }
}
