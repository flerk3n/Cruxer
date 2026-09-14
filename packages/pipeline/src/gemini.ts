import { z } from "zod";
import { PipelineError } from "./errors";
import { retry, type RetryOptions } from "./retry";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_GEMINI_MIN_REQUEST_INTERVAL_MS = 4_500;

export interface JsonGenerationRequest<TSchema extends z.ZodType> {
  prompt: string;
  schema: TSchema;
  /** A small JSON Schema improves provider-side adherence; Zod remains authoritative. */
  responseJsonSchema?: Record<string, unknown>;
}

export interface JsonGenerator {
  generate<TSchema extends z.ZodType>(request: JsonGenerationRequest<TSchema>): Promise<z.infer<TSchema>>;
}

type GeminiClient = {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config: { responseMimeType: "application/json"; responseJsonSchema?: Record<string, unknown> };
    }): Promise<{ text?: string }>;
  };
};

export interface GeminiJsonGeneratorOptions {
  apiKey?: string;
  model?: string;
  client?: GeminiClient;
  retry?: RetryOptions;
  /** Minimum time between provider request starts. Defaults below Flash-Lite's free-tier RPM. */
  minRequestIntervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** Serialises requests from one pipeline so category Promise.all calls cannot burst through provider quotas. */
class GeminiRequestGate {
  private tail: Promise<void> = Promise.resolve();
  private nextStartAt = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number,
    private readonly sleep: (milliseconds: number) => Promise<void>
  ) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: (() => void) | undefined;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const current = this.now();
      const startAt = Math.max(current, this.nextStartAt);
      if (startAt > current) await this.sleep(startAt - current);
      this.nextStartAt = startAt + this.minIntervalMs;
      return await operation();
    } finally {
      release?.();
    }
  }
}

/**
 * Thin adapter around the official Gemini SDK. The SDK is loaded lazily so
 * local unit tests can inject a client without requiring credentials.
 */
export class GeminiJsonGenerator implements JsonGenerator {
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly client?: GeminiClient;
  private readonly retryOptions?: RetryOptions;
  private readonly gate: GeminiRequestGate;

  constructor(options: GeminiJsonGeneratorOptions = {}) {
    this.model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.client = options.client;
    this.retryOptions = options.retry;
    const sleep = options.sleep ?? options.retry?.sleep ?? defaultSleep;
    this.gate = new GeminiRequestGate(options.minRequestIntervalMs ?? configuredInterval(), options.now ?? Date.now, sleep);
  }

  async generate<TSchema extends z.ZodType>(request: JsonGenerationRequest<TSchema>): Promise<z.infer<TSchema>> {
    let repairPrompt: string | undefined;
    let repairPending = false;
    let repairAttempted = false;

    return retry(async () => {
      if (repairPending) {
        repairPending = false;
        repairAttempted = true;
      }
      const client = this.client ?? await this.createClient();
      let response: { text?: string };
      try {
        response = await this.gate.run(() => client.models.generateContent({
          model: this.model,
          contents: repairPrompt ?? request.prompt,
          config: {
            responseMimeType: "application/json",
            ...(request.responseJsonSchema ? { responseJsonSchema: request.responseJsonSchema } : {})
          }
        }));
      } catch (error) {
        throw toGenerationError(error);
      }

      const text = response.text?.trim();
      if (!text) {
        queueRepair("Response body was empty.");
        throw new PipelineError("GENERATION_INVALID", "Gemini returned an empty structured response.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        queueRepair("Response was not valid JSON.");
        throw new PipelineError("GENERATION_INVALID", "Gemini returned invalid JSON.", error);
      }
      const validated = request.schema.safeParse(parsed);
      if (!validated.success) {
        queueRepair(...compactSchemaIssues(validated.error));
        throw new PipelineError("GENERATION_INVALID", "Gemini returned JSON that did not match the required schema.", validated.error.flatten());
      }
      return validated.data;

      function queueRepair(...issues: string[]) {
        if (repairAttempted || repairPending) return;
        repairPrompt = schemaRepairPrompt(request.prompt, issues);
        repairPending = true;
      }
    }, {
      ...this.retryOptions,
      shouldRetry: (error, attempt) => {
        const retryable = error instanceof PipelineError && error.code === "GENERATION_INVALID" ? repairPending : isRetryableGenerationError(error);
        return retryable && (this.retryOptions?.shouldRetry?.(error, attempt) ?? true);
      },
      retryDelayMs: (error, attempt) => providerRetryAfterMs(error) ?? this.retryOptions?.retryDelayMs?.(error, attempt)
    });
  }

  private async createClient(): Promise<GeminiClient> {
    if (!this.apiKey) throw new PipelineError("GENERATION_UNAVAILABLE", "GEMINI_API_KEY is required to generate a kit.");
    try {
      const sdkName = "@google/genai";
      const sdk = await import(/* @vite-ignore */ sdkName) as { GoogleGenAI: new (options: { apiKey: string }) => GeminiClient };
      return new sdk.GoogleGenAI({ apiKey: this.apiKey });
    } catch (error) {
      throw new PipelineError("GENERATION_UNAVAILABLE", "The Gemini SDK could not be loaded.", error);
    }
  }
}

function configuredInterval(): number {
  const configured = Number(process.env.GEMINI_MIN_REQUEST_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : DEFAULT_GEMINI_MIN_REQUEST_INTERVAL_MS;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function schemaRepairPrompt(prompt: string, issues: string[]): string {
  return `${prompt}\n\nYour previous structured response failed validation:\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\nReturn one complete corrected JSON value only. Follow the requested schema exactly; do not include markdown or commentary.`;
}

function compactSchemaIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => `${issue.path.length ? issue.path.join(".") : "root"}: ${issue.message}`);
}

function toGenerationError(error: unknown): PipelineError {
  if (error instanceof PipelineError) return error;
  if (isRateLimitError(error)) {
    return new PipelineError(
      "GENERATION_RATE_LIMITED",
      "Gemini is temporarily rate-limited. Cruxer will wait and retry within its generation budget.",
      // Keep the parsed delay explicitly. Error.message is non-enumerable, so
      // serialising a native Error later would otherwise lose Gemini's hint.
      { providerMessage: errorText(error), retryAfterMs: extractRetryAfterMs(error) }
    );
  }
  const message = error instanceof Error ? error.message : "Gemini generation request failed.";
  return new PipelineError("GENERATION_FAILED", message, error);
}

function isRetryableGenerationError(error: unknown): boolean {
  return error instanceof PipelineError && (error.code === "GENERATION_FAILED" || error.code === "GENERATION_RATE_LIMITED");
}

function providerRetryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof PipelineError)) return undefined;
  if (isRecord(error.cause) && typeof error.cause.retryAfterMs === "number") {
    return error.cause.retryAfterMs;
  }
  return extractRetryAfterMs(error.cause);
}

function isRateLimitError(error: unknown): boolean {
  return /\b429\b|resource_exhausted|quota exceeded|rate limit/i.test(errorText(error));
}

function extractRetryAfterMs(error: unknown): number | undefined {
  const matched = /(?:retryDelay|retry_after|retry-after)[^0-9]*(\d+(?:\.\d+)?)\s*(ms|s|m)?/i.exec(errorText(error));
  if (!matched) return undefined;
  const value = Number(matched[1]);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.ceil(value * (matched[2]?.toLowerCase() === "m" ? 60_000 : matched[2]?.toLowerCase() === "ms" ? 1 : 1_000));
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
