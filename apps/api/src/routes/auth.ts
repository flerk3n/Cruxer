import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { isEmailVerificationRequired, type AppConfig } from "../config/env.js";
import { EmailVerificationToken } from "../db/models/email-verification-token.js";
import { User } from "../db/models/user.js";
import { isDisposableEmail } from "../lib/disposable-domains.js";
import { ApiError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { clearSessionCookie, issueSession, setSessionCookie } from "../lib/session.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { sendEmail, verificationEmail } from "../services/email.js";
import { verifyTurnstile } from "../services/turnstile.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFICATION_EMAILS_PER_DAY = 5;

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(12, "Password must be at least 12 characters.").max(128),
  turnstileToken: z.string().trim().min(1).max(4_096).optional()
}).strict();
const verifyEmailSchema = z.object({ token: z.string().trim().regex(/^[A-Za-z0-9_-]{32,128}$/, "The verification link is invalid.") }).strict();
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
      const { name, email, password, turnstileToken } = registrationSchema.parse(req.body);
      await verifyTurnstile(config, turnstileToken, req.ip);
      if (isDisposableEmail(email)) throw new ApiError(400, "EMAIL_NOT_ALLOWED", "Please use a permanent email address.");
      const existing = await User.exists({ email });
      if (existing) throw new ApiError(409, "EMAIL_IN_USE", "An account with that email already exists.");

      const user = await User.create({ name, email, passwordHash: await hashPassword(password, config.BCRYPT_ROUNDS) });
      setSessionCookie(res, issueSession({ id: user._id.toString(), email: user.email }, config), config);
      if (isEmailVerificationRequired(config)) {
        // Registration succeeds even if delivery fails; the user can resend from the dashboard.
        await sendVerification(config, user).catch((error: unknown) => {
          console.error(JSON.stringify({ event: "verification_email_failed", reason: error instanceof Error ? error.message : "unknown" }));
        });
      }
      res.status(201).json({ user: serializeUser(user, config) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/verify-email", rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: "verify-email" }), async (req, res, next) => {
    try {
      const { token } = verifyEmailSchema.parse(req.body);
      const now = new Date();
      // Single use: the token is claimed atomically before the user is updated.
      const claimed = await EmailVerificationToken.findOneAndUpdate(
        { tokenHash: hashToken(token), usedAt: { $exists: false }, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { new: true }
      ).lean();
      if (!claimed) throw new ApiError(400, "VERIFICATION_INVALID", "This verification link is invalid or has expired. Request a new one from your dashboard.");
      await User.updateOne({ _id: claimed.userId, emailVerifiedAt: { $exists: false } }, { $set: { emailVerifiedAt: now } });
      res.json({ verified: true });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/resend-verification",
    requireAuth(config),
    rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyPrefix: "resend-verification", key: (req) => req.auth?.userId ?? req.ip ?? "unknown" }),
    async (req, res, next) => {
      try {
        const user = await User.findById(req.auth!.userId);
        if (!user) throw new ApiError(401, "INVALID_SESSION", "Your session is no longer valid. Please sign in again.");
        if (user.emailVerifiedAt) {
          res.json({ sent: false, alreadyVerified: true });
          return;
        }
        const latest = await EmailVerificationToken.findOne({ userId: user._id }).sort({ createdAt: -1 }).select("createdAt").lean();
        if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
          throw new ApiError(429, "RATE_LIMITED", "A verification email was just sent. Please wait a minute before requesting another.");
        }
        const sentToday = await EmailVerificationToken.countDocuments({ userId: user._id, createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
        if (sentToday >= MAX_VERIFICATION_EMAILS_PER_DAY) {
          throw new ApiError(429, "RATE_LIMITED", "Too many verification emails today. Please try again tomorrow.");
        }
        try {
          await sendVerification(config, user);
        } catch {
          throw new ApiError(502, "EMAIL_DELIVERY_FAILED", "The verification email could not be sent. Please try again shortly.");
        }
        res.json({ sent: true });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post("/login", credentialRateLimit, async (req, res, next) => {
    try {
      const { email, password, turnstileToken } = credentialsSchema.parse(req.body);
      await verifyTurnstile(config, turnstileToken, req.ip);
      const user = await User.findOne({ email }).select("+passwordHash");
      const valid = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!user || !valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

      setSessionCookie(res, issueSession({ id: user._id.toString(), email: user.email }, config), config);
      res.json({ user: serializeUser(user, config) });
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
      res.json({ user: serializeUser(user, config) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function serializeUser(
  user: { _id: { toString(): string }; name?: string; email: string; emailVerifiedAt?: Date; createdAt: Date },
  config: AppConfig
): { id: string; name: string; email: string; emailVerified: boolean; createdAt: string } {
  return {
    id: user._id.toString(),
    name: user.name?.trim() || user.email.split("@")[0] || "there",
    email: user.email,
    // Environments that do not require verification treat every account as verified.
    emailVerified: Boolean(user.emailVerifiedAt) || !isEmailVerificationRequired(config),
    createdAt: user.createdAt.toISOString()
  };
}

async function sendVerification(config: AppConfig, user: { _id: { toString(): string }; name?: string; email: string }): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await EmailVerificationToken.create({ userId: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) });
  const link = `${config.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail(config, { to: user.email, ...verificationEmail(user.name, link) });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
