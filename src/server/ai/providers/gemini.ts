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
import { modelFor, GEMINI_IMAGE_MODEL, GEMINI_VISION_MODEL, GEMINI_TEXT_CHAIN } from "@/server/ai/models";
import type { AiTask } from "@/server/ai/types";
import { log } from "@/server/logger";

// ── Google Gemini ─────────────────────────────────────────────────────────
// Gemini has a real free tier and asks for no card, which is what lets a shop
// owner use this app without paying anything. The trade is rate limits rather
// than a bill, so a 429 here means "wait", not "you owe money".

const API = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 60_000;
const IMAGE_TIMEOUT_MS = 180_000;
// We have a chain of models to fall back to, so hammering any one of them is
// the wrong trade: moving on is cheaper than waiting. And an owner pressing
// "Make it happen" will not sit through two minutes of shared-capacity 503s,
// so the whole walk is bounded — better an honest "busy, try again" than a
// spinner that never ends.
const MAX_ATTEMPTS = 2;
const CHAIN_DEADLINE_MS = 45_000;

/**
 * Google reports two very different things as a 429.
 *
 *  - `limit: 0` — "your plan includes none of this model". Image generation
 *    is in that bucket on the free tier, and no amount of waiting fixes it.
 *  - a per-day quota with a real limit — spent for today, back tomorrow.
 *
 * Both mean "stop asking this model", so we remember them with an expiry and
 * move on rather than burning three retries and six seconds every time.
 */
const unavailable = new Map<string, number>();
const DAY_MS = 24 * 60 * 60 * 1000;

function markUnavailable(model: string, permanent: boolean): void {
  unavailable.set(model, permanent ? Number.POSITIVE_INFINITY : Date.now() + DAY_MS);
}

function isUnavailable(model: string): boolean {
  const until = unavailable.get(model);
  if (until === undefined) return false;
  if (Date.now() < until) return true;
  unavailable.delete(model);
  return false;
}

function isHardZeroQuota(message: string): boolean {
  return /limit:\s*0\b/.test(message);
}

/** A per-day allowance that is spent — another model will still answer. */
function isDailyQuota(message: string): boolean {
  return /PerDay/i.test(message) || /quota/i.test(message);
}

/** Raised so the caller knows to try the next model rather than give up. */
class ModelExhausted extends Error {
  constructor(readonly model: string) {
    super(`Gemini model ${model} is out of free quota.`);
    this.name = "ModelExhausted";
  }
}

/**
 * Gemini 3 charges its private reasoning to the same budget as the answer.
 * A cap sized for the answer alone gets spent thinking and the reply is cut
 * off mid-sentence — which for structured output means invalid JSON.
 *
 * Pulling a price out of a sentence needs no deliberation, so those tasks
 * turn thinking off entirely: faster, and the whole budget goes to the
 * answer. The tasks that genuinely reason get room to do it.
 */
const NO_THINKING: ReadonlySet<AiTask> = new Set<AiTask>(["classify", "rewrite"]);
const THINKING_HEADROOM = 4096;

function generationConfig(
  task: AiTask,
  temperature: number,
  maxTokens: number,
  json: boolean,
): Record<string, unknown> {
  const thinks = !NO_THINKING.has(task);
  return {
    temperature,
    maxOutputTokens: maxTokens + (thinks ? THINKING_HEADROOM : 0),
    ...(thinks ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
    ...(json ? { responseMimeType: "application/json" } : {}),
  };
}

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GenerateResponse {
  candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { code?: number; message?: string; status?: string };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  private apiKey(): string {
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!key) throw new AiNotConfiguredError("gemini");
    return key;
  }

  /** POST with timeout + retry on transient failures. */
  private async request(
    model: string,
    body: unknown,
    operation: string,
    timeoutMs = TIMEOUT_MS,
  ): Promise<GenerateResponse> {
    const key = this.apiKey();
    if (isUnavailable(model)) throw new ModelExhausted(model);
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${API}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.ok) {
          const json = (await res.json()) as GenerateResponse;
          log.info({ operation, provider: this.name, status: "ok", durationMs: Date.now() - started });
          return json;
        }

        lastError = `HTTP ${res.status}`;
        const detail = (await res.json().catch(() => ({}))) as GenerateResponse;
        const message = detail.error?.message ?? "";

        if (res.status === 429) {
          if (isHardZeroQuota(message)) {
            // Not "slow down" — "your plan does not include this model".
            markUnavailable(model, true);
            log.error({ operation, provider: this.name, status: "error", error: `no_quota:${model}` });
            throw new ModelExhausted(model);
          }
          if (isDailyQuota(message)) {
            markUnavailable(model, false);
            log.info({ operation, provider: this.name, status: "ok", note: `daily_quota_spent:${model}` });
            throw new ModelExhausted(model);
          }
          // Otherwise it is a per-minute free-tier limit, which recovers.
          if (attempt === MAX_ATTEMPTS) {
            log.error({ operation, provider: this.name, status: "error", error: "rate_limited" });
            throw new AiQuotaError("Gemini", "rate_limited");
          }
        } else if (res.status === 503 && attempt === MAX_ATTEMPTS) {
          // "This model is currently experiencing high demand" — the free
          // tier's shared capacity. Nothing is wrong with the owner's account,
          // so say "busy, try again", not "something went wrong".
          log.error({ operation, provider: this.name, status: "error", error: "overloaded" });
          throw new AiQuotaError("Gemini", "rate_limited");
        } else if (res.status === 404 && /no longer available|not found/i.test(message)) {
          // Google retires model names on a short fuse. Their message names
          // the replacement, so pass it through rather than swallowing it.
          log.error({ operation, provider: this.name, status: "error", error: `retired:${model}` });
          throw new Error(
            `Gemini model "${model}" is retired. ${message.slice(0, 200)} Set AI_MODEL_GEMINI to a current model.`,
          );
        } else if (res.status === 400 && /API key not valid/i.test(message)) {
          throw new AiNotConfiguredError("gemini");
        } else if (res.status < 500) {
          log.error({ operation, provider: this.name, status: "error", error: `${lastError}: ${message.slice(0, 200)}` });
          throw new Error(`Gemini request failed (${res.status}): ${message.slice(0, 300)}`);
        }
      } catch (err) {
        if (err instanceof ModelExhausted) throw err;
        if (err instanceof AiQuotaError || err instanceof AiNotConfiguredError) throw err;
        if (err instanceof Error && /Gemini request failed/.test(err.message)) throw err;
        lastError = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
      } finally {
        clearTimeout(timer);
      }

      if (attempt < MAX_ATTEMPTS) {
        // The free tier shares capacity, so a blip lasts longer here than on
        // a paid endpoint — but not so long that the owner is left staring at
        // a spinner. Google's own retry hint is ~48s; we would rather come
        // back with "busy, try again in a minute" than hold the request open.
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }

    log.error({ operation, provider: this.name, status: "error", error: lastError });
    throw new Error(`Gemini request failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
  }

  /**
   * Runs the request against the first model in the chain that still has free
   * quota today. Returns which model actually answered, so callers can report
   * it honestly rather than naming the one they asked for.
   */
  private async requestChain(
    models: string[],
    body: (model: string) => unknown,
    operation: string,
    timeoutMs = TIMEOUT_MS,
  ): Promise<{ json: GenerateResponse; model: string }> {
    const deadline = Date.now() + CHAIN_DEADLINE_MS;
    let blocked = 0;
    for (const model of models) {
      if (Date.now() > deadline) break;
      try {
        return { json: await this.request(model, body(model), operation, timeoutMs), model };
      } catch (err) {
        // Out of quota for today, or busy right now — either way another
        // model in the chain may well answer, so keep walking. Only a real
        // fault (bad key, bad request, retired model) stops us.
        if (err instanceof ModelExhausted || err instanceof AiQuotaError) {
          blocked++;
          continue;
        }
        throw err;
      }
    }
    log.error({ operation, provider: this.name, status: "error", error: `all_models_blocked:${blocked}` });
    throw new AiQuotaError("Gemini", "rate_limited");
  }

  private static text(json: GenerateResponse): string {
    return (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
  }

  /** The models to try, best first — the configured one leads the chain. */
  private chain(task: Parameters<typeof modelFor>[0]): string[] {
    const preferred = modelFor(task, this.name).model;
    return [preferred, ...GEMINI_TEXT_CHAIN.filter((m) => m !== preferred)];
  }

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    const cfg = modelFor(input.task, this.name);
    const { json, model } = await this.requestChain(
      this.chain(input.task),
      () => ({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: generationConfig(
          input.task,
          input.temperature ?? cfg.temperature,
          input.maxTokens ?? cfg.maxTokens,
          false,
        ),
      }),
      `ai.text.${input.task}`,
    );
    return {
      text: GeminiProvider.text(json),
      model,
      provider: this.name,
      inputTokens: json.usageMetadata?.promptTokenCount,
      outputTokens: json.usageMetadata?.candidatesTokenCount,
    };
  }

  async generateStructured<T>(
    input: StructuredGenerationInput,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; model: string; provider: string }> {
    const cfg = modelFor(input.task, this.name);
    const operation = `ai.structured.${input.schemaName}`;
    const models = this.chain(input.task);
    const deadline = Date.now() + CHAIN_DEADLINE_MS;
    let lastInvalid: AiOutputInvalidError | null = null;
    let blocked = 0;

    // Validation lives inside the chain, not after it: the smaller models we
    // fall back to sometimes answer with an empty array or a missing field,
    // and that should move us to the next model exactly like a quota block
    // does — not fail the owner's campaign.
    for (const model of models) {
      if (Date.now() > deadline) break;
      let json: GenerateResponse;
      try {
        json = await this.request(
          model,
          {
            systemInstruction: { parts: [{ text: input.system }] },
            contents: [{ role: "user", parts: [{ text: input.prompt }] }],
            generationConfig: generationConfig(
              input.task,
              input.temperature ?? cfg.temperature,
              input.maxTokens ?? cfg.maxTokens,
              true,
            ),
          },
          operation,
        );
      } catch (err) {
        if (err instanceof ModelExhausted || err instanceof AiQuotaError) {
          blocked++;
          continue;
        }
        throw err;
      }

      const invalid = (detail: string) => {
        lastInvalid = new AiOutputInvalidError(input.schemaName, detail);
        log.info({ operation, provider: this.name, status: "ok", note: `invalid_output:${model}` });
      };

      if (json.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        invalid("the model ran out of output budget before finishing");
        continue;
      }

      let parsed: unknown;
      try {
        // Gemini honours responseMimeType, but a fenced block still shows up
        // occasionally — strip it rather than fail the owner's request.
        parsed = JSON.parse(GeminiProvider.text(json).replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        invalid("response was not valid JSON");
        continue;
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        invalid(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400));
        continue;
      }
      return { data: result.data, model, provider: this.name };
    }

    if (lastInvalid) throw lastInvalid;
    log.error({ operation, provider: this.name, status: "error", error: `all_models_blocked:${blocked}` });
    throw new AiQuotaError("Gemini", "rate_limited");
  }

  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const shape =
      input.size === "story"
        ? "Compose for a 9:16 vertical frame."
        : input.size === "portrait"
          ? "Compose for a 4:5 portrait frame."
          : "Compose for a 1:1 square frame.";

    const parts: Part[] = [{ text: `${input.prompt}\n\n${shape}` }];
    for (const buf of input.references ?? []) {
      parts.push({ inlineData: { mimeType: "image/png", data: buf.toString("base64") } });
    }

    let json: GenerateResponse;
    try {
      json = await this.request(
        GEMINI_IMAGE_MODEL,
        {
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        },
        "ai.image",
        IMAGE_TIMEOUT_MS,
      );
    } catch (err) {
      // Image generation is not on Gemini's free tier at all. Report it as a
      // quota problem so the flyer falls back to the renderer quietly.
      if (err instanceof ModelExhausted) throw new AiQuotaError("Gemini", "no_credit");
      throw err;
    }

    const image = (json.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
    if (!image?.inlineData) {
      const said = GeminiProvider.text(json);
      throw new Error(
        `Gemini returned no image${said ? `: ${said.slice(0, 200)}` : "."}`,
      );
    }
    return {
      data: Buffer.from(image.inlineData.data, "base64"),
      model: GEMINI_IMAGE_MODEL,
      provider: this.name,
    };
  }

  async readImage(input: { image: Buffer; question: string }): Promise<string> {
    const { json } = await this.requestChain(
      [GEMINI_VISION_MODEL, ...GEMINI_TEXT_CHAIN.filter((m) => m !== GEMINI_VISION_MODEL)],
      () => ({
        contents: [
          {
            role: "user",
            parts: [
              { text: input.question },
              { inlineData: { mimeType: "image/png", data: input.image.toString("base64") } },
            ],
          },
        ],
        generationConfig: generationConfig("classify", 0, 800, false),
      }),
      "ai.vision",
    );
    return GeminiProvider.text(json);
  }
}
