import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { AppConfig } from "../config/env.js";
import { ApiError } from "../lib/errors.js";
import { clearSessionCookie, verifySession } from "../lib/session.js";

export function requireAuth(config: AppConfig): RequestHandler {
  return (req, res, next) => {
    const token = req.cookies?.[config.COOKIE_NAME];
    if (typeof token !== "string" || token.length === 0) {
      return next(new ApiError(401, "AUTH_REQUIRED", "Sign in to continue."));
    }

    try {
      const claims = verifySession(token, config);
      req.auth = { userId: claims.sub, email: claims.email };
      return next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        clearSessionCookie(res, config);
        return next(new ApiError(401, "INVALID_SESSION", "Your session has expired. Please sign in again."));
      }
      return next(error);
    }
  };
}
