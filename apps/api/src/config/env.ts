import { z } from "zod";

const environmentSchema = z.enum(["development", "test", "production"]);
const optionalSecret = z.string().trim().min(1).optional();
const booleanFlag = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: environmentSchema.default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters."),
  JWT_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("cruxer_session"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  ELEVENLABS_API_KEY: optionalSecret,
  ELEVENLABS_AGENT_ID: z.string().trim().regex(/^agent_[A-Za-z0-9]+$/, "ELEVENLABS_AGENT_ID must start with agent_").optional(),

  // Billing (Dodo Payments). Billing is required in production unless explicitly disabled.
  BILLING_ENABLED: booleanFlag.optional(),
  DODO_PAYMENTS_API_KEY: optionalSecret,
  DODO_PAYMENTS_WEBHOOK_KEY: optionalSecret,
  DODO_PAYMENTS_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"),
  DODO_PRO_PRODUCT_ID: optionalSecret,

  // Signup abuse protection.
  RESEND_API_KEY: optionalSecret,
  EMAIL_FROM: z.string().trim().min(3).default("Cruxer <onboarding@resend.dev>"),
  TURNSTILE_SECRET_KEY: optionalSecret,
  /** Development/test convenience only: production always requires verification. */
  REQUIRE_EMAIL_VERIFICATION: booleanFlag.optional(),
  /** Development/test convenience only: treat every user as Pro. Rejected in production. */
  DEV_GRANT_PRO: booleanFlag.optional()
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;
  if (env.DEV_GRANT_PRO) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DEV_GRANT_PRO"], message: "DEV_GRANT_PRO cannot be used in production." });
  const required: Array<keyof typeof env> = ["RESEND_API_KEY", "TURNSTILE_SECRET_KEY"];
  if (env.BILLING_ENABLED !== false) required.push("DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY", "DODO_PRO_PRODUCT_ID");
  for (const key of required) {
    if (!env[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required in production.` });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

/** Parse configuration once at process startup. Never log this result: it includes secrets. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid API environment configuration: ${fields}`);
  }
  return parsed.data;
}

/** Billing is on when credentials exist, unless explicitly disabled. */
export function isBillingEnabled(config: AppConfig): boolean {
  if (config.BILLING_ENABLED === false) return false;
  return Boolean(config.DODO_PAYMENTS_API_KEY && config.DODO_PRO_PRODUCT_ID);
}

export function isEmailVerificationRequired(config: AppConfig): boolean {
  if (config.NODE_ENV === "production") return true;
  return config.REQUIRE_EMAIL_VERIFICATION ?? false;
}
