export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Provider-directed delays (for example, Retry-After) take precedence over jittered backoff. */
  retryDelayMs?: (error: unknown, attempt: number) => number | undefined;
}

export async function retry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 4_000;
  const jitter = options.jitter ?? Math.random;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const shouldRetry = options.shouldRetry ?? (() => true);
  const retryDelayMs = options.retryDelayMs;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) break;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const providerDelay = retryDelayMs?.(error, attempt);
      // Never shorten a delay explicitly requested by the provider.
      await sleep(providerDelay === undefined ? Math.round(exponential * (0.5 + jitter())) : Math.max(providerDelay, exponential));
    }
  }
  throw lastError;
}

export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
