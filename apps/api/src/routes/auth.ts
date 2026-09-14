import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { User } from "../db/models/user.js";
import { ApiError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { clearSessionCookie, issueSession, setSessionCookie } from "../lib/session.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(12, "Password must be at least 12 characters.").max(128)
}).strict();
const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(1, "Enter your name.").max(80).transform((value) => value.replace(/\s+/g, " "))
}).strict();

// Session reads are performed whenever the dashboard loads and must not be
// counted as credential guesses. Keep one shared bucket for the two endpoints
// that accept a password so login/register brute-force protection remains intact.
const credentialRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 25, keyPrefix: "auth-credentials" });

export function createAuthRouter(config: AppConfig): Router {
  const router = Router();

  router.post("/register", credentialRateLimit, async (req, res, next) => {
    try {
      const { name, email, password } = registrationSchema.parse(req.body);
      const existing = await User.exists({ email });
      if (existing) throw new ApiError(409, "EMAIL_IN_USE", "An account with that email already exists.");

      const user = await User.create({ name, email, passwordHash: await hashPassword(password, config.BCRYPT_ROUNDS) });
      setSessionCookie(res, issueSession({ id: user._id.toString(), email: user.email }, config), config);
      res.status(201).json({ user: serializeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", credentialRateLimit, async (req, res, next) => {
    try {
      const { email, password } = credentialsSchema.parse(req.body);
      const user = await User.findOne({ email }).select("+passwordHash");
      const valid = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!user || !valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

      setSessionCookie(res, issueSession({ id: user._id.toString(), email: user.email }, config), config);
      res.json({ user: serializeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", (_req, res) => {
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.get("/session", requireAuth(config), async (req, res, next) => {
    try {
      const user = await User.findById(req.auth!.userId);
      if (!user) {
        clearSessionCookie(res, config);
        throw new ApiError(401, "INVALID_SESSION", "Your session is no longer valid. Please sign in again.");
      }
      res.json({ user: serializeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function serializeUser(user: { _id: { toString(): string }; name?: string; email: string; createdAt: Date }): { id: string; name: string; email: string; createdAt: string } {
  return { id: user._id.toString(), name: user.name?.trim() || user.email.split("@")[0] || "there", email: user.email, createdAt: user.createdAt.toISOString() };
}
