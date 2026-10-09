import { isValidObjectId } from "mongoose";
import { Subscription } from "../db/models/subscription.js";
import { User } from "../db/models/user.js";
import type { BillingProvider, ProviderSubscription } from "../services/dodo.js";
import { hasProAccess } from "./entitlements.js";

/**
 * Re-reads a subscription from Dodo and mirrors it locally. Webhooks can arrive
 * late, twice, or out of order; reading the provider's current state on every
 * event makes processing idempotent and order-independent.
 */
export async function syncSubscription(provider: BillingProvider, subscriptionId: string, proProductId: string | undefined): Promise<"synced" | "ignored"> {
  const remote = await provider.getSubscription(subscriptionId);
  if (proProductId && remote.productId !== proProductId) {
    console.warn(JSON.stringify({ event: "billing_unknown_product", subscriptionId, productId: remote.productId }));
    return "ignored";
  }

  const userId = await resolveUserId(remote);
  if (!userId) {
    console.error(JSON.stringify({ event: "billing_subscription_unlinked", subscriptionId }));
    return "ignored";
  }

  const existing = await Subscription.findOne({ userId }).select("dodoSubscriptionId status currentPeriodEnd").lean();
  if (existing && existing.dodoSubscriptionId !== remote.subscriptionId && hasProAccess(existing) && !hasProAccess(remote)) {
    // A late event for an older, inactive subscription must not replace the live one.
    console.info(JSON.stringify({ event: "billing_stale_subscription_ignored", subscriptionId }));
    return "ignored";
  }

  await Subscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        dodoSubscriptionId: remote.subscriptionId,
        dodoCustomerId: remote.customerId,
        productId: remote.productId,
        status: remote.status,
        currentPeriodStart: remote.currentPeriodStart,
        currentPeriodEnd: remote.currentPeriodEnd,
        cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
        lastSyncedAt: new Date()
      }
    },
    { upsert: true, new: true, runValidators: true }
  );
  await User.updateOne({ _id: userId }, { $set: { dodoCustomerId: remote.customerId } });
  console.info(JSON.stringify({ event: "billing_subscription_synced", subscriptionId, status: remote.status }));
  return "synced";
}

async function resolveUserId(remote: ProviderSubscription): Promise<string | undefined> {
  // Checkout metadata is set server-side from the authenticated session.
  const metadataUserId = remote.metadata.userId;
  if (metadataUserId && isValidObjectId(metadataUserId) && await User.exists({ _id: metadataUserId })) return metadataUserId;

  const known = await Subscription.findOne({ dodoSubscriptionId: remote.subscriptionId }).select("userId").lean();
  if (known) return known.userId.toString();

  const byCustomer = await User.findOne({ dodoCustomerId: remote.customerId }).select("_id").lean();
  if (byCustomer) return byCustomer._id.toString();

  const byEmail = await User.findOne({ email: remote.customerEmail.toLowerCase() }).select("_id").lean();
  return byEmail?._id.toString();
}
