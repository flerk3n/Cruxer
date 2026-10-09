import type { RequestHandler } from "express";
import { ApiError } from "../lib/errors.js";

interface Bucket { count: number; resetAt: number }

/** Small per-process guard for authentication brute force. A shared limiter belongs in deployment scaling work. */
export function rateLimit({ windowMs, max, keyPrefix = "", key: keyFor }: { windowMs: number; max: number; keyPrefix?: string; key?: (req: Parameters<RequestHandler>[0]) => string }): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${keyFor ? keyFor(req) : req.ip}`;
    if (buckets.size > 10_000) {
      // Bound memory on a long-lived process: drop windows that have already reset.
      for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", Math.max(0, max - bucket.count));
    res.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));
    if (bucket.count > max) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      return next(new ApiError(429, "RATE_LIMITED", "Too many requests. Try again shortly."));
    }
    return next();
  };
}
