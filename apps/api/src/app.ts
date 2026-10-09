import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { isBillingEnabled, type AppConfig } from "./config/env.js";
import { errorHandler, notFound, requestContext } from "./lib/errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { createBillingRouter, createBillingWebhookHandler } from "./routes/billing.js";
import { createGenerationRunsRouter } from "./routes/generation-runs.js";
import { createKitsRouter } from "./routes/kits.js";
import { createMockInterviewsRouter } from "./routes/mock-interviews.js";
import { createWorkspaceRouter } from "./routes/workspace.js";
import { CruxerKitPipeline, type KitPipeline } from "../../../packages/pipeline/src/index.js";
import { DodoBillingProvider, type BillingProvider } from "./services/dodo.js";
import { GenerationOrchestrator } from "./services/generation-orchestrator.js";

export interface AppDependencies {
  /** Tests inject a deterministic fake; production uses the shared Gemini pipeline. */
  pipeline?: KitPipeline;
  /** Tests inject a fake; production uses Dodo Payments when billing is configured. */
  billing?: BillingProvider;
  /** Shared with background jobs so refunds use the same orchestrator. */
  generation?: GenerationOrchestrator;
}

export function createApp(config: AppConfig, dependencies: AppDependencies = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  // Render sits behind a trusted proxy; required for accurate IP limits and secure cookies.
  app.set("trust proxy", 1);
  app.use(requestContext);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE"] }));
  const billing = dependencies.billing ?? (isBillingEnabled(config) ? new DodoBillingProvider(config) : undefined);
  // Signature verification needs the exact request bytes, so this precedes express.json().
  app.post("/billing/webhook", express.raw({ type: "*/*", limit: "1mb" }), createBillingWebhookHandler(config, billing));
  app.use(express.json({ limit: "100kb", type: "application/json" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.use("/auth", createAuthRouter(config));
  const generation = dependencies.generation ?? new GenerationOrchestrator(dependencies.pipeline ?? new CruxerKitPipeline(), config);
  app.use("/kits", createKitsRouter(config, generation));
  app.use("/kits/:kitId/mock-interviews", createMockInterviewsRouter(config));
  app.use("/workspace", createWorkspaceRouter(config));
  app.use("/billing", createBillingRouter(config, billing));
  app.use("/generation-runs", createGenerationRunsRouter(config, generation));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
