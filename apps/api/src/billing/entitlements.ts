import { Types } from "mongoose";
import type { AppConfig } from "../config/env.js";
import { MockInterviewSession } from "../db/models/mock-interview-session.js";
import { Subscription, type SubscriptionRecord } from "../db/models/subscription.js";
import { UsageCounter, type UsageCounterRecord } from "../db/models/usage-counter.js";
import { UsageEvent, type UsageEventType } from "../db/models/usage-event.js";
import { ApiError, isDuplicateKeyError } from "../lib/errors.js";
import { MIN_MOCK_START_SECONDS, PLANS, PRO_GRACE_PERIOD_MS, type PlanId, type PlanLimits } from "./plans.js";

export interface PlanContext {
  plan: PlanId;
  limits: PlanLimits;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  subscription?: Pick<SubscriptionRecord, "status" | "currentPeriodEnd" | "cancelAtPeriodEnd" | "dodoSubscriptionId">;
}

export interface UsageSummary {
  plan: PlanId;
  periodStart: string;
  resetsAt: string;
  kits: { used: number; limit: number };
  mockSeconds: { used: number; reserved: number; limit: number };
  regenerationsPerKit: number;
  maxMockSessionSeconds: number;
  subscription?: { status: SubscriptionRecord["status"]; currentPeriodEnd: string; cancelAtPeriodEnd: boolean };
}

type EntitlementConfig = Pick<AppConfig, "NODE_ENV" | "DEV_GRANT_PRO">;
type Session = { userId: string; periodKey: string; plan: PlanId };

/** Whether a stored subscription currently grants Pro access. */
export function hasProAccess(subscription: Pick<SubscriptionRecord, "status" | "currentPeriodEnd">, now = new Date()): boolean {
  if (subscription.status === "active") return true;
  // A cancelled subscription has been paid through its period; a past-due one is in dunning.
  if (subscription.status === "cancelled" || subscription.status === "past_due") {
    return now.getTime() < subscription.currentPeriodEnd.getTime() + PRO_GRACE_PERIOD_MS;
  }
  return false;
}

export function freePeriod(now = new Date()): { periodKey: string; periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return { periodKey: `free:${now.getUTCFullYear()}-${month}`, periodStart, periodEnd };
}

export async function resolvePlan(userId: string, config: EntitlementConfig, now = new Date()): Promise<PlanContext> {
  const subscription = await Subscription.findOne({ userId })
    .select("status currentPeriodStart currentPeriodEnd cancelAtPeriodEnd dodoSubscriptionId")
    .lean();
  if (subscription && hasProAccess(subscription, now)) {
    return {
      plan: "pro",
      limits: PLANS.pro,
      // A renewal moves currentPeriodStart, which starts a fresh usage counter.
      periodKey: `pro:${subscription.dodoSubscriptionId}:${subscription.currentPeriodStart.toISOString()}`,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      subscription
    };
  }
  const period = freePeriod(now);
  if (config.NODE_ENV !== "production" && config.DEV_GRANT_PRO) {
    return { plan: "pro", limits: PLANS.pro, ...period, periodKey: period.periodKey.replace(/^free:/, "dev-pro:") };
  }
  return { plan: "free", limits: PLANS.free, ...period, ...(subscription ? { subscription } : {}) };
}

export async function getUsageSummary(userId: string, config: EntitlementConfig): Promise<UsageSummary> {
  const context = await resolvePlan(userId, config);
  const counter = await UsageCounter.findOne({ userId, periodKey: context.periodKey }).lean();
  return {
    plan: context.plan,
    periodStart: context.periodStart.toISOString(),
    resetsAt: context.periodEnd.toISOString(),
    kits: { used: counter?.kitsUsed ?? 0, limit: context.limits.kitsPerPeriod },
    mockSeconds: { used: counter?.mockSecondsUsed ?? 0, reserved: counter?.mockSecondsReserved ?? 0, limit: context.limits.mockSecondsPerPeriod },
    regenerationsPerKit: context.limits.regenerationsPerKit,
    maxMockSessionSeconds: context.limits.maxMockSessionSeconds,
    ...(context.subscription ? {
      subscription: {
        status: context.subscription.status,
        currentPeriodEnd: context.subscription.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: context.subscription.cancelAtPeriodEnd
      }
    } : {})
  };
}

/**
 * Atomically consumes one kit generation. The limit lives in the update predicate,
 * so concurrent requests cannot both take the last remaining credit.
 */
export async function reserveKit(userId: string, refId: string, config: EntitlementConfig): Promise<Session> {
  const context = await resolvePlan(userId, config);
  await ensureCounter(userId, context.periodKey);
  const counter = await UsageCounter.findOneAndUpdate(
    { userId, periodKey: context.periodKey, kitsUsed: { $lt: context.limits.kitsPerPeriod } },
    { $inc: { kitsUsed: 1 } },
    { new: true }
  );
  if (!counter) {
    throw new ApiError(402, "QUOTA_EXCEEDED", context.plan === "free"
      ? `You've used all ${context.limits.kitsPerPeriod} free kits this month. Upgrade to Pro for ${PLANS.pro.kitsPerPeriod} kits a month.`
      : `You've used all ${context.limits.kitsPerPeriod} kits in this billing period.`, {
      feature: "kits",
      plan: context.plan,
      limit: context.limits.kitsPerPeriod,
      used: context.limits.kitsPerPeriod,
      resetsAt: context.periodEnd.toISOString()
    });
  }
  const recorded = await recordEvent({ userId, type: "kit_reserved", amount: 1, refId, periodKey: context.periodKey, plan: context.plan });
  if (!recorded) {
    // This attempt was already charged; give back the duplicate increment.
    await UsageCounter.updateOne({ userId, periodKey: context.periodKey, kitsUsed: { $gt: 0 } }, { $inc: { kitsUsed: -1 } });
  }
  return { userId, periodKey: context.periodKey, plan: context.plan };
}

/** Returns a kit credit at most once per reservation. */
export async function refundKit(userId: string, refId: string, periodKey: string): Promise<boolean> {
  const plan: PlanId = periodKey.startsWith("free:") ? "free" : "pro";
  const recorded = await recordEvent({ userId, type: "kit_refunded", amount: 1, refId, periodKey, plan });
  if (!recorded) return false;
  await UsageCounter.updateOne({ userId, periodKey, kitsUsed: { $gt: 0 } }, { $inc: { kitsUsed: -1 } });
  return true;
}

/**
 * Reserves voice time for one mock session: the smaller of the remaining period
 * allowance and the per-session ceiling. Uses compare-and-set on the counter so
 * concurrent starts cannot oversubscribe the allowance.
 */
export async function reserveMockSeconds(userId: string, sessionId: string, config: EntitlementConfig): Promise<Session & { seconds: number }> {
  const context = await resolvePlan(userId, config);
  if (context.limits.mockSecondsPerPeriod === 0) {
    throw new ApiError(403, "PLAN_REQUIRED", "Live mock interviews are part of Cruxer Pro.", { feature: "mock_interview", plan: context.plan });
  }
  await ensureCounter(userId, context.periodKey);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const counter = await UsageCounter.findOne({ userId, periodKey: context.periodKey }).lean() as UsageCounterRecord | null;
    const used = counter?.mockSecondsUsed ?? 0;
    const reserved = counter?.mockSecondsReserved ?? 0;
    const remaining = context.limits.mockSecondsPerPeriod - used - reserved;
    if (remaining < MIN_MOCK_START_SECONDS) {
      throw new ApiError(402, "QUOTA_EXCEEDED", reserved > 0
        ? "Another mock interview is still holding your remaining minutes. End it first or wait a few minutes."
        : "You've used all your live mock interview minutes for this billing period.", {
        feature: "mock_minutes",
        plan: context.plan,
        limit: context.limits.mockSecondsPerPeriod,
        used,
        resetsAt: context.periodEnd.toISOString()
      });
    }
    const seconds = Math.min(remaining, context.limits.maxMockSessionSeconds);
    const updated = await UsageCounter.findOneAndUpdate(
      { userId, periodKey: context.periodKey, mockSecondsUsed: used, mockSecondsReserved: reserved },
      { $inc: { mockSecondsReserved: seconds } },
      { new: true }
    );
    if (updated) {
      await recordEvent({ userId, type: "mock_reserved", amount: seconds, refId: sessionId, periodKey: context.periodKey, plan: context.plan });
      return { userId, periodKey: context.periodKey, plan: context.plan, seconds };
    }
  }
  throw new ApiError(409, "USAGE_CONFLICT", "Your usage changed while starting this interview. Please try again.");
}

/**
 * Converts a session's reservation into billed seconds exactly once. `actualSeconds`
 * of null releases the reservation without charging (the call never connected).
 */
export async function settleMockSession(sessionId: string, actualSeconds: number | null): Promise<boolean> {
  const billed = actualSeconds === null ? 0 : Math.max(0, Math.ceil(actualSeconds));
  const session = await MockInterviewSession.findOneAndUpdate(
    { _id: sessionId, reservedSeconds: { $exists: true }, billedSeconds: { $exists: false } },
    { $set: { billedSeconds: billed } },
    { new: false }
  ).lean();
  if (!session || session.reservedSeconds === undefined || !session.periodKey) return false;
  const userId = session.ownerId.toString();
  await UsageCounter.updateOne(
    { userId, periodKey: session.periodKey },
    { $inc: { mockSecondsReserved: -session.reservedSeconds, mockSecondsUsed: billed } }
  );
  const type: UsageEventType = actualSeconds === null ? "mock_released" : "mock_settled";
  await recordEvent({ userId, type, amount: billed, refId: sessionId, periodKey: session.periodKey, plan: session.periodKey.startsWith("free:") ? "free" : "pro" });
  console.info(JSON.stringify({ event: "mock_interview_usage_settled", sessionId, billedSeconds: billed, reservedSeconds: session.reservedSeconds }));
  return true;
}

async function ensureCounter(userId: string, periodKey: string): Promise<void> {
  try {
    await UsageCounter.updateOne(
      { userId, periodKey },
      { $setOnInsert: { kitsUsed: 0, mockSecondsReserved: 0, mockSecondsUsed: 0 } },
      { upsert: true }
    );
  } catch (error) {
    // A concurrent request created the row first; that is the desired outcome.
    if (!isDuplicateKeyError(error)) throw error;
  }
}

async function recordEvent(event: { userId: string; type: UsageEventType; amount: number; refId: string; periodKey: string; plan: PlanId }): Promise<boolean> {
  try {
    await UsageEvent.create({ ...event, userId: new Types.ObjectId(event.userId) });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}
