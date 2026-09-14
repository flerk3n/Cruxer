import { PipelineError } from "./errors";
import { retry, retryAfterMs, type RetryOptions } from "./retry";
import type { UrlSafetyPolicy } from "./url-policy";

export type FetchImplementation = typeof fetch;

export interface SafeFetchOptions {
  urlPolicy: UrlSafetyPolicy;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  allowedContentTypes?: string[];
  retry?: RetryOptions;
}

export interface RetrievedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

/**
 * Fetches text safely. Each redirect target is approved again, so a public URL
 * cannot use a redirect to reach a private address.
 */
export class SafeTextFetcher {
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly allowedContentTypes: string[];
  private readonly userAgent: string;

  constructor(private readonly options: SafeFetchOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxBytes = options.maxBytes ?? 1_000_000;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.allowedContentTypes = options.allowedContentTypes ?? ["text/html", "application/xhtml+xml", "text/plain"];
    this.userAgent = options.userAgent ?? "CruxerResearchBot/0.1 (+https://cruxer.app)";
  }

  async fetchText(url: string): Promise<RetrievedPage> {
    return retry(() => this.fetchOnce(url), {
      ...this.options.retry,
      shouldRetry: (error, attempt) => this.isRetryable(error) && (this.options.retry?.shouldRetry?.(error, attempt) ?? true)
    });
  }

  private async fetchOnce(initialUrl: string): Promise<RetrievedPage> {
    let current = await this.options.urlPolicy.assertAllowed(initialUrl);
    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const response = await this.request(current);
      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new PipelineError("HTTP_ERROR", "Redirect response did not include a location.");
        if (redirectCount === this.maxRedirects) throw new PipelineError("HTTP_ERROR", "Too many redirects while retrieving company page.");
        current = await this.options.urlPolicy.assertAllowed(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new HttpStatusError(response.status, `Company page returned HTTP ${response.status}.`, retryAfterMs(response.headers.get("retry-after")));

      const contentType = response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() ?? "";
      if (!this.allowedContentTypes.includes(contentType)) {
        throw new PipelineError("UNEXPECTED_CONTENT_TYPE", `Unsupported response content type: ${contentType || "missing"}.`);
      }
      return { url: current.toString(), status: response.status, contentType, body: await readLimitedBody(response, this.maxBytes) };
    }
    throw new PipelineError("HTTP_ERROR", "Could not retrieve company page.");
  }

  private async request(url: URL): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImplementation(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "text/html,application/xhtml+xml,text/plain;q=0.8", "user-agent": this.userAgent }
      });
    } catch (error) {
      throw new PipelineError("COMPANY_UNREACHABLE", "Company site could not be retrieved.", error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof HttpStatusError) return error.status === 408 || error.status === 429 || error.status >= 500;
    return error instanceof PipelineError && error.code === "COMPANY_UNREACHABLE";
  }
}

export class HttpStatusError extends PipelineError {
  constructor(public readonly status: number, message: string, public readonly retryAfter?: number) {
    super("HTTP_ERROR", message);
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new PipelineError("RESPONSE_TOO_LARGE", `Response exceeds the ${maxBytes} byte limit.`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new PipelineError("RESPONSE_TOO_LARGE", `Response exceeds the ${maxBytes} byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
