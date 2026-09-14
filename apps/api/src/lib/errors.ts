import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
};

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, "NOT_FOUND", `No route exists for ${req.method} ${req.path}.`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const normalized = normalizeError(error);
  if (normalized.status >= 500) {
    // Deliberately omit error contents: database/JWT errors can reveal operational details.
    console.error(JSON.stringify({ requestId: req.requestId, code: normalized.code }));
  }

  res.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
      requestId: req.requestId
    }
  });
};

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return new ApiError(
      400,
      "VALIDATION_ERROR",
      "The request contains invalid data.",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    );
  }
  if (isDuplicateKeyError(error)) {
    return new ApiError(409, "CONFLICT", "That record already exists.");
  }
  return new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
}
