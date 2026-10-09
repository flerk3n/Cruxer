import DodoPayments from "dodopayments";
import type { AppConfig } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

/** The subset of a Dodo subscription Cruxer stores. */
export interface ProviderSubscription {
  subscriptionId: string;
  customerId: string;
  customerEmail: string;
  productId: string;
  status: "pending" | "active" | "on_hold" | "paused" | "cancelled" | "failed" | "expired" | "past_due";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
}

export interface VerifiedWebhook {
  webhookId: string;
  type: string;
  /** Present for subscription.* events. */
  subscriptionId?: string;
}

/** Billing provider boundary. Tests inject a fake; production uses Dodo Payments. */
export interface BillingProvider {
  createCheckout(input: { productId: string; customer: { customerId: string } | { email: string; name: string }; userId: string; returnUrl: string; cancelUrl: string }): Promise<{ checkoutUrl: string }>;
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  getSubscription(subscriptionId: string): Promise<ProviderSubscription>;
  /** Throws when the Standard Webhooks signature is invalid. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): VerifiedWebhook;
}

export class DodoBillingProvider implements BillingProvider {
  private readonly client: DodoPayments;

  constructor(config: Pick<AppConfig, "DODO_PAYMENTS_API_KEY" | "DODO_PAYMENTS_WEBHOOK_KEY" | "DODO_PAYMENTS_ENVIRONMENT">) {
    this.client = new DodoPayments({
      bearerToken: config.DODO_PAYMENTS_API_KEY,
      webhookKey: config.DODO_PAYMENTS_WEBHOOK_KEY ?? null,
      environment: config.DODO_PAYMENTS_ENVIRONMENT,
      timeout: 15_000,
      maxRetries: 2
    });
  }

  async createCheckout(input: Parameters<BillingProvider["createCheckout"]>[0]): Promise<{ checkoutUrl: string }> {
    const session = await this.client.checkoutSessions.create({
      product_cart: [{ product_id: input.productId, quantity: 1 }],
      customer: "customerId" in input.customer ? { customer_id: input.customer.customerId } : { email: input.customer.email, name: input.customer.name },
      metadata: { userId: input.userId },
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl
    });
    if (!session.checkout_url) throw new ApiError(502, "CHECKOUT_UNAVAILABLE", "Checkout could not be started. Please try again.");
    return { checkoutUrl: session.checkout_url };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.client.customers.customerPortal.create(customerId, { return_url: returnUrl });
    return { url: session.link };
  }

  async getSubscription(subscriptionId: string): Promise<ProviderSubscription> {
    const subscription = await this.client.subscriptions.retrieve(subscriptionId);
    return {
      subscriptionId: subscription.subscription_id,
      customerId: subscription.customer.customer_id,
      customerEmail: subscription.customer.email,
      productId: subscription.product_id,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.previous_billing_date),
      currentPeriodEnd: new Date(subscription.next_billing_date),
      cancelAtPeriodEnd: subscription.cancel_at_next_billing_date,
      metadata: Object.fromEntries(Object.entries(subscription.metadata ?? {}).map(([key, value]) => [key, String(value)]))
    };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): VerifiedWebhook {
    const event = this.client.webhooks.unwrap(rawBody, { headers }) as { type: string; data?: { subscription_id?: unknown } };
    const webhookId = headers["webhook-id"];
    if (!webhookId) throw new Error("Missing webhook-id header.");
    const subscriptionId = event.type.startsWith("subscription.") && typeof event.data?.subscription_id === "string" ? event.data.subscription_id : undefined;
    return { webhookId, type: event.type, ...(subscriptionId ? { subscriptionId } : {}) };
  }
}
