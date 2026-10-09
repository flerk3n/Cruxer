import { once } from "node:events";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { Webhook } from "standardwebhooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => {
  const model = () => ({
    create: vi.fn(), exists: vi.fn(), find: vi.fn(), findById: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn(), countDocuments: vi.fn()
  });
  return {
    Kit: model(), GenerationRun: model(), User: model(), PracticeProgress: model(), StudyActivity: model(),
    Subscription: model(), UsageCounter: model(), UsageEvent: model(), WebhookEvent: model(),
    MockInterviewSession: model(), EmailVerificationToken: model()
  };
});

vi.mock("./db/models/kit.js", () => ({ Kit: models.Kit }));
vi.mock("./db/models/generation-run.js", () => ({ GenerationRun: models.GenerationRun }));
vi.mock("./db/models/user.js", () => ({ User: models.User }));
vi.mock("./db/models/practice-progress.js", () => ({ PracticeProgress: models.PracticeProgress }));
vi.mock("./db/models/study-activity.js", () => ({ StudyActivity: models.StudyActivity }));
vi.mock("./db/models/subscription.js", () => ({ Subscription: models.Subscription }));
vi.mock("./db/models/usage-counter.js", () => ({ UsageCounter: models.UsageCounter }));
vi.mock("./db/models/usage-event.js", () => ({ UsageEvent: models.UsageEvent }));
vi.mock("./db/models/webhook-event.js", () => ({ WebhookEvent: models.WebhookEvent }));
vi.mock("./db/models/mock-interview-session.js", () => ({ MockInterviewSession: models.MockInterviewSession }));
vi.mock("./db/models/email-verification-token.js", () => ({ EmailVerificationToken: models.EmailVerificationToken }));

import { createApp } from "./app.js";
import type { AppConfig } from "./config/env.js";
import { sweepOnce } from "./jobs/sweeper.js";
import { issueSession } from "./lib/session.js";
import { DodoBillingProvider, type BillingProvider, type ProviderSubscription } from "./services/dodo.js";
import { GenerationOrchestrator } from "./services/generation-orchestrator.js";

const OWNER_ID = "507f1f77bcf86cd799439011";
const KIT_ID = "507f1f77bcf86cd799439013";
const WEBHOOK_SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const baseConfig: AppConfig = {
  NODE_ENV: "test",
  PORT: 4000,
  MONGODB_URI: "mongodb://not-used/cruxer",
  JWT_SECRET: "test-secret-that-is-long-enough-for-jwt-signing",
  JWT_TTL_DAYS: 7,
  BCRYPT_ROUNDS: 10,
  COOKIE_NAME: "cruxer_session",
  WEB_ORIGIN: "http://localhost:3000",
  DODO_PAYMENTS_ENVIRONMENT: "test_mode",
  DODO_PAYMENTS_API_KEY: "test-api-key",
  DODO_PAYMENTS_WEBHOOK_KEY: WEBHOOK_SECRET,
  DODO_PRO_PRODUCT_ID: "pdt_pro",
  EMAIL_FROM: "Cruxer <test@example.com>"
};

function query<T>(value: T) {
  const result = { select: vi.fn(), sort: vi.fn(), limit: vi.fn(), lean: vi.fn() };
  result.select.mockReturnValue(result);
  result.sort.mockReturnValue(result);
  result.limit.mockReturnValue(result);
  result.lean.mockResolvedValue(value);
  Object.assign(result, { then: (resolve: (resolved: T) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(value).then(resolve, reject) });
  return result;
}

const providerSubscription: ProviderSubscription = {
  subscriptionId: "sub_live",
  customerId: "cus_123",
  customerEmail: "owner@example.com",
  productId: "pdt_pro",
  status: "active",
  currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
  currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
  cancelAtPeriodEnd: false,
  metadata: { userId: OWNER_ID }
};

/** Real Standard Webhooks verification from the Dodo SDK; only the network read is faked. */
class TestDodoProvider extends DodoBillingProvider {
  getSubscription = vi.fn(async (_id: string) => providerSubscription);
  createCheckout = vi.fn(async () => ({ checkoutUrl: "https://test.checkout.dodopayments.com/session" }));
  createPortalSession = vi.fn(async () => ({ url: "https://test.customer.dodopayments.com/portal" }));
}

async function serve(app: Express) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => (server as Server).close((error) => error ? reject(error) : resolve()))
  };
}

function authCookie(config: AppConfig) {
  return `${config.COOKIE_NAME}=${issueSession({ id: OWNER_ID, email: "owner@example.com" }, config)}`;
}

function signedWebhook(payload: unknown, id = `msg_${randomBytes(6).toString("hex")}`) {
  const body = JSON.stringify(payload);
  const timestamp = new Date();
  const signature = new Webhook(WEBHOOK_SECRET).sign(id, timestamp, body);
  return { body, headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "webhook-signature": signature } };
}

describe("launch controls", () => {
  let provider: TestDodoProvider;
  let baseUrl = "";
  let close: (() => Promise<void>) | undefined;
  const realFetch = globalThis.fetch;

  async function start(config: AppConfig = baseConfig, billing: BillingProvider = provider) {
    await close?.();
    const started = await serve(createApp(config, { billing, pipeline: { run: vi.fn() } }));
    baseUrl = started.baseUrl;
    close = started.close;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    provider = new TestDodoProvider(baseConfig);
    models.Subscription.findOne.mockReturnValue(query(null));
    models.UsageCounter.updateOne.mockResolvedValue({});
    models.UsageEvent.create.mockResolvedValue({});
    await start();
  });

  afterEach(async () => {
    await close?.();
    close = undefined;
    globalThis.fetch = realFetch;
  });

  describe("Dodo webhook", () => {
    it("rejects an invalid signature without recording the delivery", async () => {
      const { body, headers } = signedWebhook({ type: "subscription.active", data: { subscription_id: "sub_live" } });
      const response = await fetch(`${baseUrl}/billing/webhook`, { method: "POST", body, headers: { ...headers, "webhook-signature": "v1,invalid" } });
      expect(response.status).toBe(401);
      expect(models.WebhookEvent.create).not.toHaveBeenCalled();
      expect(provider.getSubscription).not.toHaveBeenCalled();
    });

    it("verifies the raw body, then mirrors the re-fetched provider state instead of the payload", async () => {
      models.WebhookEvent.create.mockResolvedValue({});
      models.User.exists.mockResolvedValue(true);
      models.Subscription.findOne.mockReturnValue(query(null));
      models.Subscription.findOneAndUpdate.mockResolvedValue({});
      models.User.updateOne.mockResolvedValue({});
      models.WebhookEvent.updateOne.mockResolvedValue({});
      // The payload claims "cancelled"; the provider's current state ("active") must win.
      const { body, headers } = signedWebhook({ type: "subscription.cancelled", business_id: "biz", timestamp: new Date().toISOString(), data: { subscription_id: "sub_live", status: "cancelled" } });

      const response = await fetch(`${baseUrl}/billing/webhook`, { method: "POST", body, headers });
      expect(response.status).toBe(200);
      expect(provider.getSubscription).toHaveBeenCalledWith("sub_live");
      expect(models.Subscription.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: OWNER_ID },
        { $set: expect.objectContaining({ status: "active", dodoSubscriptionId: "sub_live", currentPeriodEnd: providerSubscription.currentPeriodEnd }) },
        expect.objectContaining({ upsert: true })
      );
      expect(models.User.updateOne).toHaveBeenCalledWith({ _id: OWNER_ID }, { $set: { dodoCustomerId: "cus_123" } });
      expect(models.WebhookEvent.updateOne).toHaveBeenCalled();
    });

    it("acknowledges an already-processed delivery without reprocessing it", async () => {
      models.WebhookEvent.create.mockRejectedValue(Object.assign(new Error("dup"), { code: 11_000 }));
      models.WebhookEvent.findOne.mockReturnValue(query({ processedAt: new Date() }));
      const { body, headers } = signedWebhook({ type: "subscription.renewed", data: { subscription_id: "sub_live" } });
      const response = await fetch(`${baseUrl}/billing/webhook`, { method: "POST", body, headers });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true, duplicate: true });
      expect(provider.getSubscription).not.toHaveBeenCalled();
    });

    it("ignores a late event for an old subscription that would replace a live one", async () => {
      models.WebhookEvent.create.mockResolvedValue({});
      models.WebhookEvent.updateOne.mockResolvedValue({});
      models.User.exists.mockResolvedValue(true);
      provider.getSubscription.mockResolvedValue({ ...providerSubscription, subscriptionId: "sub_old", status: "expired" });
      models.Subscription.findOne.mockReturnValue(query({ dodoSubscriptionId: "sub_live", status: "active", currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z") }));
      const { body, headers } = signedWebhook({ type: "subscription.expired", data: { subscription_id: "sub_old" } });
      const response = await fetch(`${baseUrl}/billing/webhook`, { method: "POST", body, headers });
      expect(response.status).toBe(200);
      expect(models.Subscription.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("checkout", () => {
    it("creates a Dodo checkout tied to the authenticated user", async () => {
      models.User.findById.mockReturnValue(query({ email: "owner@example.com", name: "Owner" }));
      const response = await fetch(`${baseUrl}/billing/checkout`, { method: "POST", headers: { Cookie: authCookie(baseConfig) } });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ checkoutUrl: "https://test.checkout.dodopayments.com/session" });
      expect(provider.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
        productId: "pdt_pro",
        userId: OWNER_ID,
        customer: { email: "owner@example.com", name: "Owner" },
        returnUrl: "http://localhost:3000/dashboard/billing?checkout=return"
      }));
    });

    it("blocks a second subscription for a user who already has Pro", async () => {
      models.Subscription.findOne.mockReturnValue(query({ status: "active", dodoSubscriptionId: "sub_live", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86_400_000), cancelAtPeriodEnd: false }));
      const response = await fetch(`${baseUrl}/billing/checkout`, { method: "POST", headers: { Cookie: authCookie(baseConfig) } });
      expect(response.status).toBe(409);
      expect(provider.createCheckout).not.toHaveBeenCalled();
    });

    it("requires a verified email where verification is enforced", async () => {
      const config = { ...baseConfig, REQUIRE_EMAIL_VERIFICATION: true };
      await start(config);
      models.User.findById.mockReturnValue(query({ emailVerifiedAt: undefined }));
      const response = await fetch(`${baseUrl}/billing/checkout`, { method: "POST", headers: { Cookie: authCookie(config) } });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("EMAIL_NOT_VERIFIED");
    });
  });

  describe("plan enforcement", () => {
    it("refuses live mock interviews on the free plan before touching the kit or provider", async () => {
      const response = await fetch(`${baseUrl}/kits/${KIT_ID}/mock-interviews`, {
        method: "POST", headers: { Cookie: authCookie(baseConfig), "Content-Type": "application/json" }, body: JSON.stringify({ questionCount: 5 })
      });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("PLAN_REQUIRED");
      expect(models.Kit.findOne).not.toHaveBeenCalled();
      expect(models.MockInterviewSession.create).not.toHaveBeenCalled();
    });

    it("stops a free user's sixth kit before any generation run is created", async () => {
      models.Kit.findOne.mockReturnValue(query({ status: "draft", generationInput: { jd: "Build APIs", companyUrl: "https://example.com", days: 5 } }));
      models.GenerationRun.findOne.mockReturnValue(query(null));
      models.UsageCounter.findOneAndUpdate.mockResolvedValue(null);
      const response = await fetch(`${baseUrl}/kits/${KIT_ID}/generate`, { method: "POST", headers: { Cookie: authCookie(baseConfig) } });
      expect(response.status).toBe(402);
      const body = await response.json() as { error: { code: string; details: { feature: string; limit: number } } };
      expect(body.error.code).toBe("QUOTA_EXCEEDED");
      expect(body.error.details).toMatchObject({ feature: "kits", limit: 5 });
      expect(models.GenerationRun.create).not.toHaveBeenCalled();
    });

    it("refunds the kit credit when the run cannot be created", async () => {
      models.Kit.findOne.mockReturnValue(query({ status: "draft", generationInput: { jd: "Build APIs", companyUrl: "https://example.com", days: 5 } }));
      models.GenerationRun.findOne.mockReturnValue(query(null));
      models.UsageCounter.findOneAndUpdate.mockResolvedValue({ kitsUsed: 1 });
      models.GenerationRun.create.mockRejectedValue(Object.assign(new Error("dup"), { code: 11_000 }));
      const response = await fetch(`${baseUrl}/kits/${KIT_ID}/generate`, { method: "POST", headers: { Cookie: authCookie(baseConfig) } });
      expect(response.status).toBe(409);
      expect(models.UsageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ type: "kit_reserved" }));
      expect(models.UsageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ type: "kit_refunded" }));
    });

    it("refuses a regeneration beyond the per-kit fair-use cap", async () => {
      models.Kit.findOne.mockReturnValue(query({ status: "ready", revision: 2, kit: {}, generationInput: { jd: "x", companyUrl: "https://example.com", days: 3 }, regenerationCount: 3 }));
      const response = await fetch(`${baseUrl}/kits/${KIT_ID}/regenerate`, {
        method: "POST", headers: { Cookie: authCookie(baseConfig), "Content-Type": "application/json" }, body: JSON.stringify({ revision: 2, section: "flashcards" })
      });
      expect(response.status).toBe(402);
      expect(((await response.json()) as { error: { details: { feature: string } } }).error.details.feature).toBe("regenerations");
      expect(models.GenerationRun.create).not.toHaveBeenCalled();
    });
  });

  describe("signup protection", () => {
    it("rejects disposable inboxes at registration", async () => {
      const response = await fetch(`${baseUrl}/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Throwaway", email: "x@mailinator.com", password: "a-long-enough-password" })
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("EMAIL_NOT_ALLOWED");
      expect(models.User.create).not.toHaveBeenCalled();
    });

    it("rejects a failed Turnstile check before any password work", async () => {
      const config = { ...baseConfig, TURNSTILE_SECRET_KEY: "turnstile-secret" };
      await start(config);
      globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).startsWith("https://challenges.cloudflare.com/")) return new Response(JSON.stringify({ success: false }), { status: 200 });
        return realFetch(input, init);
      }) as typeof fetch;
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "owner@example.com", password: "a-long-enough-password", turnstileToken: "bad" })
      });
      expect(response.status).toBe(403);
      expect(models.User.findOne).not.toHaveBeenCalled();
    });

    it("verifies an email with a single-use token and rejects reuse", async () => {
      models.EmailVerificationToken.findOneAndUpdate.mockReturnValueOnce(query({ userId: OWNER_ID })).mockReturnValueOnce(query(null));
      models.User.updateOne.mockResolvedValue({});
      const token = randomBytes(32).toString("base64url");
      const first = await fetch(`${baseUrl}/auth/verify-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      expect(first.status).toBe(200);
      expect(models.EmailVerificationToken.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ usedAt: { $exists: false }, tokenHash: expect.not.stringContaining(token) }),
        expect.anything(),
        expect.anything()
      );
      expect(models.User.updateOne).toHaveBeenCalledWith({ _id: OWNER_ID, emailVerifiedAt: { $exists: false } }, { $set: { emailVerifiedAt: expect.any(Date) } });
      const second = await fetch(`${baseUrl}/auth/verify-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      expect(second.status).toBe(400);
    });
  });
});

describe("recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    models.UsageCounter.updateOne.mockResolvedValue({});
    models.UsageEvent.create.mockResolvedValue({});
  });

  it("refunds a failed attempt's kit credit exactly once", async () => {
    const orchestrator = new GenerationOrchestrator({ run: vi.fn() }, baseConfig);
    models.GenerationRun.findOneAndUpdate.mockReturnValueOnce(query({ ownerId: { toString: () => OWNER_ID }, charge: { kind: "kit", refId: "run:0", periodKey: "free:2026-10", refunded: false } }));
    await orchestrator.refundCharge("run");
    expect(models.UsageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ type: "kit_refunded", refId: "run:0" }));
    expect(models.UsageCounter.updateOne).toHaveBeenCalledWith(expect.objectContaining({ periodKey: "free:2026-10", kitsUsed: { $gt: 0 } }), { $inc: { kitsUsed: -1 } });

    models.GenerationRun.findOneAndUpdate.mockReturnValueOnce(query(null));
    models.UsageEvent.create.mockClear();
    await orchestrator.refundCharge("run");
    expect(models.UsageEvent.create).not.toHaveBeenCalled();
  });

  it("returns a regeneration to the per-kit allowance when it fails", async () => {
    const orchestrator = new GenerationOrchestrator({ run: vi.fn() }, baseConfig);
    models.GenerationRun.findOneAndUpdate.mockReturnValueOnce(query({ ownerId: OWNER_ID, kitId: KIT_ID, charge: { kind: "regeneration", refId: "run:0", refunded: false } }));
    models.Kit.updateOne.mockResolvedValue({});
    await orchestrator.refundCharge("run");
    expect(models.Kit.updateOne).toHaveBeenCalledWith({ _id: KIT_ID, regenerationCount: { $gt: 0 } }, { $inc: { regenerationCount: -1 } });
  });

  it("makes interrupted generation runs retryable and refunds them", async () => {
    const generation = { refundCharge: vi.fn(async () => undefined) };
    models.GenerationRun.find.mockReturnValue(query([{ _id: "run-1" }]));
    models.GenerationRun.findOneAndUpdate.mockReturnValue(query({ _id: { toString: () => "run-1" }, kitId: KIT_ID }));
    models.Kit.updateOne.mockResolvedValue({});
    models.MockInterviewSession.find.mockReturnValue(query([]));
    const result = await sweepOnce(baseConfig, generation, new Date());
    expect(result.runs).toBe(1);
    expect(models.GenerationRun.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $in: ["queued", "running"] } }),
      { $set: expect.objectContaining({ status: "retryable" }) },
      { new: true }
    );
    expect(models.Kit.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: KIT_ID, status: "generating" }), { $set: { status: "failed" } });
    expect(generation.refundCharge).toHaveBeenCalledWith("run-1");
  });

  it("releases voice reservations for abandoned sessions when the provider is not configured", async () => {
    const generation = { refundCharge: vi.fn(async () => undefined) };
    models.GenerationRun.find.mockReturnValue(query([]));
    models.MockInterviewSession.find.mockReturnValueOnce(query([{ _id: "session-1" }])).mockReturnValueOnce(query([]));
    models.MockInterviewSession.findOneAndUpdate
      .mockReturnValueOnce(query({ _id: { toString: () => "session-1" } }))
      .mockReturnValueOnce(query({ ownerId: { toString: () => OWNER_ID }, periodKey: "pro:sub:p", reservedSeconds: 600 }));
    const result = await sweepOnce(baseConfig, generation, new Date());
    expect(result.mocks).toBe(1);
    expect(models.UsageCounter.updateOne).toHaveBeenCalledWith({ userId: OWNER_ID, periodKey: "pro:sub:p" }, { $inc: { mockSecondsReserved: -600, mockSecondsUsed: 0 } });
  });
});
