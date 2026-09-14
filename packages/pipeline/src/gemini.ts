import { z } from "zod";
import { PipelineError } from "./errors";
import { retry, type RetryOptions } from "./retry";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

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

  constructor(options: GeminiJsonGeneratorOptions = {}) {
    this.model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.client = options.client;
    this.retryOptions = options.retry;
  }

  async generate<TSchema extends z.ZodType>(request: JsonGenerationRequest<TSchema>): Promise<z.infer<TSchema>> {
    return retry(async () => {
      const client = this.client ?? await this.createClient();
      let response: { text?: string };
      try {
        response = await client.models.generateContent({
          model: this.model,
          contents: request.prompt,
          config: {
            responseMimeType: "application/json",
            ...(request.responseJsonSchema ? { responseJsonSchema: request.responseJsonSchema } : {})
          }
        });
      } catch (error) {
        throw toGenerationError(error);
      }

      const text = response.text?.trim();
      if (!text) throw new PipelineError("GENERATION_INVALID", "Gemini returned an empty structured response.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new PipelineError("GENERATION_INVALID", "Gemini returned invalid JSON.", error);
      }
      const validated = request.schema.safeParse(parsed);
      if (!validated.success) {
        throw new PipelineError("GENERATION_INVALID", "Gemini returned JSON that did not match the required schema.", validated.error.flatten());
      }
      return validated.data;
    }, {
      ...this.retryOptions,
      shouldRetry: (error, attempt) => isRetryableGenerationError(error) && (this.retryOptions?.shouldRetry?.(error, attempt) ?? true)
    });
  }

  private async createClient(): Promise<GeminiClient> {
    if (!this.apiKey) throw new PipelineError("GENERATION_UNAVAILABLE", "GEMINI_API_KEY is required to generate a kit.");
    try {
      // Keep this dynamic: consumers only need the SDK when they create the real adapter.
      const sdkName = "@google/genai";
      const sdk = await import(/* @vite-ignore */ sdkName) as { GoogleGenAI: new (options: { apiKey: string }) => GeminiClient };
      return new sdk.GoogleGenAI({ apiKey: this.apiKey });
    } catch (error) {
      throw new PipelineError("GENERATION_UNAVAILABLE", "The Gemini SDK could not be loaded.", error);
    }
  }
}

function toGenerationError(error: unknown): PipelineError {
  if (error instanceof PipelineError) return error;
  const message = error instanceof Error ? error.message : "Gemini generation request failed.";
  return new PipelineError("GENERATION_FAILED", message, error);
}

function isRetryableGenerationError(error: unknown): boolean {
  if (error instanceof PipelineError) {
    return error.code === "GENERATION_INVALID" || error.code === "GENERATION_FAILED";
  }
  return false;
}
