import { z } from "zod";

const environmentSchema = z.enum(["development", "test", "production"]);

const envSchema = z.object({
  NODE_ENV: environmentSchema.default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters."),
  JWT_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("cruxer_session"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  ELEVENLABS_API_KEY: z.string().trim().min(1).optional(),
  ELEVENLABS_AGENT_ID: z.string().trim().regex(/^agent_[A-Za-z0-9]+$/, "ELEVENLABS_AGENT_ID must start with agent_").optional()
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
