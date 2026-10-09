import type { RequestHandler } from "express";
import { isEmailVerificationRequired, type AppConfig } from "../config/env.js";
import { User } from "../db/models/user.js";
import { ApiError } from "../lib/errors.js";

/** Guards spend-incurring actions (generation, mock interviews, checkout). Use after requireAuth. */
export function requireVerifiedEmail(config: AppConfig): RequestHandler {
  return async (req, _res, next) => {
    if (!isEmailVerificationRequired(config)) return next();
    try {
      const user = await User.findById(req.auth!.userId).select("emailVerifiedAt").lean();
      if (!user) return next(new ApiError(401, "INVALID_SESSION", "Your session is no longer valid. Please sign in again."));
      if (!user.emailVerifiedAt) return next(new ApiError(403, "EMAIL_NOT_VERIFIED", "Verify your email address to continue. Check your inbox for the link."));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
