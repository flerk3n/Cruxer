import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { AppConfig } from "./config/env.js";
import { errorHandler, notFound, requestContext } from "./lib/errors.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { createAuthRouter } from "./routes/auth.js";

export function createApp(config: AppConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  // Render sits behind a trusted proxy; required for accurate IP limits and secure cookies.
  app.set("trust proxy", 1);
  app.use(requestContext);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE"] }));
  app.use(express.json({ limit: "100kb", type: "application/json" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.use("/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 25, keyPrefix: "auth" }), createAuthRouter(config));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
