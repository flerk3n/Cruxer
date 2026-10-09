import DodoPayments from "dodopayments";
import { Router, type RequestHandler } from "express";
import { getUsageSummary, resolvePlan } from "../billing/entitlements.js";
import { PLANS } from "../billing/plans.js";
import { syncSubscription } from "../billing/subscription-sync.js";
import { isBillingEnabled, type AppConfig } from "../config/env.js";
import { User } from "../db/models/user.js";
import { WebhookEvent } from "../db/models/webhook-event.js";
import { ApiError, isDuplicateKeyError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { requireVerifiedEmail } from "../middleware/require-verified-email.js";
import type { BillingProvider } from "../services/dodo.js";

export function publicPlans() {
  return Object.values(PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    priceUsdMonthly: plan.priceUsdMonthly,
    kitsPerPeriod: plan.kitsPerPeriod,
    mockMinutesPerPeriod: Math.floor(plan.mockSecondsPerPeriod / 60),
    maxMockSessionMinutes: Math.floor(plan.maxMockSessionSeconds / 60),
    regenerationsPerKit: plan.regenerationsPerKit
  }));
}

export function createBillingRouter(config: AppConfig, provider: BillingProvider | undefined): Router {
  const router = Router();
  const billingEnabled = isBillingEnabled(config) && provider !== undefined;

  router.get("/plans", (_req, res) => {
    res.json({ plans: publicPlans() });
  });

  router.use(requireAuth(config));

  router.get("/me", async (req, res, next) => {
    try {
      res.json({ billingEnabled, plans: publicPlans(), usage: await getUsageSummary(req.auth!.userId, config) });
    } catch (error) { next(error); }
  });

  router.post("/checkout", rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "billing-checkout" }), requireVerifiedEmail(config), async (req, res, next) => {
    try {
      if (!billingEnabled || !provider || !config.DODO_PRO_PRODUCT_ID) throw new ApiError(503, "BILLING_UNAVAILABLE", "Upgrades are not available right now.");
      const userId = req.auth!.userId;
      const context = await resolvePlan(userId, config);
      if (context.subscription && context.plan === "pro") {
        throw new ApiError(409, "ALREADY_SUBSCRIBED", "You already have Cruxer Pro. Manage it from the billing page.");
      }
      const user = await User.findById(userId).select("email name dodoCustomerId").lean();
      if (!user) throw new ApiError(401, "INVALID_SESSION", "Your session is no longer valid. Please sign in again.");
      const { checkoutUrl } = await provider.createCheckout({
        productId: config.DODO_PRO_PRODUCT_ID,
        customer: user.dodoCustomerId ? { customerId: user.dodoCustomerId } : { email: user.email, name: user.name ?? user.email },
        userId,
        returnUrl: `${config.WEB_ORIGIN}/dashboard/billing?checkout=return`,
        cancelUrl: `${config.WEB_ORIGIN}/dashboard/billing?checkout=cancelled`
      });
      console.info(JSON.stringify({ event: "billing_checkout_created", userId }));
      res.status(201).json({ checkoutUrl });
    } catch (error) { next(toProviderError(error)); }
  });

  router.post("/portal", rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "billing-portal" }), async (req, res, next) => {
    try {
      if (!billingEnabled || !provider) throw new ApiError(503, "BILLING_UNAVAILABLE", "Billing management is not available right now.");
      const user = await User.findById(req.auth!.userId).select("dodoCustomerId").lean();
      if (!user?.dodoCustomerId) throw new ApiError(409, "NO_BILLING_ACCOUNT", "There is no subscription to manage yet.");
      const { url } = await provider.createPortalSession(user.dodoCustomerId, `${config.WEB_ORIGIN}/dashboard/billing`);
      res.json({ url });
    } catch (error) { next(toProviderError(error)); }
  });

  return router;
}

/**
 * Dodo webhook receiver. It must be mounted with a raw body parser before
 * express.json(), because the Standard Webhooks signature covers the exact bytes.
 */
export function createBillingWebhookHandler(config: AppConfig, provider: BillingProvider | undefined): RequestHandler {
  return async (req, res, next) => {
    try {
      if (!provider || !config.DODO_PAYMENTS_WEBHOOK_KEY) throw new ApiError(503, "BILLING_UNAVAILABLE", "Billing webhooks are not configured.");
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      const headers = {
        "webhook-id": req.get("webhook-id") ?? "",
        "webhook-signature": req.get("webhook-signature") ?? "",
        "webhook-timestamp": req.get("webhook-timestamp") ?? ""
      };

      let event: ReturnType<BillingProvider["verifyWebhook"]>;
      try {
        event = provider.verifyWebhook(rawBody, headers);
      } catch {
        throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "The webhook signature is invalid.");
      }

      try {
        await WebhookEvent.create({ webhookId: event.webhookId, provider: "dodo", type: event.type });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const previous = await WebhookEvent.findOne({ webhookId: event.webhookId }).select("processedAt").lean();
        // A delivery that failed midway is safe to process again: syncing is idempotent.
        if (previous?.processedAt) {
          res.status(200).json({ received: true, duplicate: true });
          return;
        }
      }

      if (event.subscriptionId) {
        await syncSubscription(provider, event.subscriptionId, config.DODO_PRO_PRODUCT_ID);
      } else {
        console.info(JSON.stringify({ event: "billing_webhook_logged", type: event.type, webhookId: event.webhookId }));
      }
      await WebhookEvent.updateOne({ webhookId: event.webhookId }, { $set: { processedAt: new Date() } });
      res.status(200).json({ received: true });
    } catch (error) {
      // A non-2xx response makes Dodo retry the delivery later.
      next(toProviderError(error));
    }
  };
}

function toProviderError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof DodoPayments.APIError) {
    console.error(JSON.stringify({ event: "billing_provider_error", status: error.status }));
    return new ApiError(502, "BILLING_PROVIDER_ERROR", "The payment provider could not complete this request. Please try again.");
  }
  return error;
}
