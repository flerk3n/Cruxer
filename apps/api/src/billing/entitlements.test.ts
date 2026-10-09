import { beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => ({
  Subscription: { findOne: vi.fn() },
  UsageCounter: { updateOne: vi.fn(), findOneAndUpdate: vi.fn(), findOne: vi.fn() },
  UsageEvent: { create: vi.fn() },
  MockInterviewSession: { findOneAndUpdate: vi.fn() }
}));

vi.mock("../db/models/subscription.js", () => ({ Subscription: models.Subscription }));
vi.mock("../db/models/usage-counter.js", () => ({ UsageCounter: models.UsageCounter }));
vi.mock("../db/models/usage-event.js", () => ({ UsageEvent: models.UsageEvent }));
vi.mock("../db/models/mock-interview-session.js", () => ({ MockInterviewSession: models.MockInterviewSession }));

import { freePeriod, hasProAccess, refundKit, reserveKit, reserveMockSeconds, resolvePlan, settleMockSession } from "./entitlements.js";
import { PLANS } from "./plans.js";

const USER_ID = "507f1f77bcf86cd799439011";
const config = { NODE_ENV: "test" as const, DEV_GRANT_PRO: undefined };
const duplicateKey = Object.assign(new Error("E11000"), { code: 11_000 });

function query<T>(value: T) {
  const result = { select: vi.fn(), lean: vi.fn() };
  result.select.mockReturnValue(result);
  result.lean.mockResolvedValue(value);
  return result;
}

function activePro(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    dodoSubscriptionId: "sub_123",
    currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  models.Subscription.findOne.mockReturnValue(query(null));
  models.UsageCounter.updateOne.mockResolvedValue({});
  models.UsageEvent.create.mockResolvedValue({});
});

describe("plan resolution", () => {
  it("keys free usage by UTC calendar month", () => {
    const period = freePeriod(new Date("2026-10-31T23:59:59.000Z"));
    expect(period.periodKey).toBe("free:2026-10");
    expect(period.periodEnd.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("grants Pro to active subscriptions and keys usage by billing period", async () => {
    models.Subscription.findOne.mockReturnValue(query(activePro()));
    const context = await resolvePlan(USER_ID, config, new Date("2026-10-15T00:00:00.000Z"));
    expect(context.plan).toBe("pro");
    expect(context.periodKey).toBe("pro:sub_123:2026-10-01T00:00:00.000Z");
    expect(context.limits).toBe(PLANS.pro);
  });

  it("starts a fresh Pro counter after renewal moves the period start", async () => {
    models.Subscription.findOne.mockReturnValue(query(activePro({ currentPeriodStart: new Date("2026-11-01T00:00:00.000Z") })));
    const context = await resolvePlan(USER_ID, config);
    expect(context.periodKey).toBe("pro:sub_123:2026-11-01T00:00:00.000Z");
  });

  it("keeps Pro after cancellation until the paid period (plus grace) ends", () => {
    const cancelled = { status: "cancelled" as const, currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z") };
    expect(hasProAccess(cancelled, new Date("2026-10-20T00:00:00.000Z"))).toBe(true);
    expect(hasProAccess(cancelled, new Date("2026-11-03T00:00:00.000Z"))).toBe(false);
  });

  it("drops to Free when payment is on hold", async () => {
    models.Subscription.findOne.mockReturnValue(query(activePro({ status: "on_hold" })));
    const context = await resolvePlan(USER_ID, config);
    expect(context.plan).toBe("free");
    expect(context.periodKey).toMatch(/^free:/);
  });

  it("only honours the development Pro override outside production", async () => {
    expect((await resolvePlan(USER_ID, { NODE_ENV: "development", DEV_GRANT_PRO: true })).plan).toBe("pro");
    expect((await resolvePlan(USER_ID, { NODE_ENV: "production", DEV_GRANT_PRO: true })).plan).toBe("free");
  });
});

describe("kit quota", () => {
  it("reserves a kit with the limit inside the atomic update predicate", async () => {
    models.UsageCounter.findOneAndUpdate.mockResolvedValue({ kitsUsed: 1 });
    const session = await reserveKit(USER_ID, "run:0", config);
    expect(session.plan).toBe("free");
    expect(models.UsageCounter.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, kitsUsed: { $lt: PLANS.free.kitsPerPeriod } }),
      { $inc: { kitsUsed: 1 } },
      { new: true }
    );
    expect(models.UsageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ type: "kit_reserved", refId: "run:0" }));
  });

  it("rejects the sixth free kit with a structured quota error", async () => {
    models.UsageCounter.findOneAndUpdate.mockResolvedValue(null);
    await expect(reserveKit(USER_ID, "run:0", config)).rejects.toMatchObject({
      status: 402,
      code: "QUOTA_EXCEEDED",
      details: expect.objectContaining({ feature: "kits", plan: "free", limit: 5 })
    });
    expect(models.UsageEvent.create).not.toHaveBeenCalled();
  });

  it("gives back the increment when the same attempt is reserved twice", async () => {
    models.UsageCounter.findOneAndUpdate.mockResolvedValue({ kitsUsed: 2 });
    models.UsageEvent.create.mockRejectedValue(duplicateKey);
    await reserveKit(USER_ID, "run:0", config);
    expect(models.UsageCounter.updateOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ kitsUsed: { $gt: 0 } }),
      { $inc: { kitsUsed: -1 } }
    );
  });

  it("refunds a kit only once per attempt", async () => {
    expect(await refundKit(USER_ID, "run:0", "free:2026-10")).toBe(true);
    models.UsageEvent.create.mockRejectedValueOnce(duplicateKey);
    models.UsageCounter.updateOne.mockClear();
    expect(await refundKit(USER_ID, "run:0", "free:2026-10")).toBe(false);
    expect(models.UsageCounter.updateOne).not.toHaveBeenCalled();
  });
});

describe("mock interview minutes", () => {
  it("is unavailable on the free plan", async () => {
    await expect(reserveMockSeconds(USER_ID, "session-1", config)).rejects.toMatchObject({ status: 403, code: "PLAN_REQUIRED" });
  });

  it("reserves the smaller of the remaining allowance and the session ceiling", async () => {
    models.Subscription.findOne.mockReturnValue(query(activePro()));
    models.UsageCounter.findOne.mockReturnValue(query({ mockSecondsUsed: 1_500, mockSecondsReserved: 0 }));
    models.UsageCounter.findOneAndUpdate.mockResolvedValue({});
    const reservation = await reserveMockSeconds(USER_ID, "session-1", config);
    expect(reservation.seconds).toBe(300);
    expect(models.UsageCounter.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ mockSecondsUsed: 1_500, mockSecondsReserved: 0 }),
      { $inc: { mockSecondsReserved: 300 } },
      { new: true }
    );
  });

  it("caps a fresh period's reservation at one session", async () => {
    models.Subscription.findOne.mockReturnValue(query(activePro()));
    models.UsageCounter.findOne.mockReturnValue(query({ mockSecondsUsed: 0, mockSecondsReserved: 0 }));
    models.UsageCounter.findOneAndUpdate.mockResolvedValue({});
    expect((await reserveMockSeconds(USER_ID, "session-1", config)).seconds).toBe(PLANS.pro.maxMockSessionSeconds);
  });

  it("refuses to start with less than a minute left", async () => {
    models.Subscription.findOne.mockReturnValue(query(activePro()));
    models.UsageCounter.findOne.mockReturnValue(query({ mockSecondsUsed: 1_770, mockSecondsReserved: 0 }));
    await expect(reserveMockSeconds(USER_ID, "session-1", config)).rejects.toMatchObject({ status: 402, code: "QUOTA_EXCEEDED" });
  });

  it("retries the compare-and-set when usage changed concurrently", async () => {
    models.Subscription.findOne.mockReturnValue(query(activePro()));
    models.UsageCounter.findOne.mockReturnValue(query({ mockSecondsUsed: 0, mockSecondsReserved: 0 }));
    models.UsageCounter.findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce({});
    await reserveMockSeconds(USER_ID, "session-1", config);
    expect(models.UsageCounter.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("settles the actual call length against the reservation exactly once", async () => {
    models.MockInterviewSession.findOneAndUpdate.mockReturnValue(query({ ownerId: { toString: () => USER_ID }, periodKey: "pro:sub_123:p", reservedSeconds: 600 }));
    expect(await settleMockSession("session-1", 241.2)).toBe(true);
    expect(models.MockInterviewSession.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ billedSeconds: { $exists: false } }),
      { $set: { billedSeconds: 242 } },
      { new: false }
    );
    expect(models.UsageCounter.updateOne).toHaveBeenCalledWith(
      { userId: USER_ID, periodKey: "pro:sub_123:p" },
      { $inc: { mockSecondsReserved: -600, mockSecondsUsed: 242 } }
    );

    models.MockInterviewSession.findOneAndUpdate.mockReturnValue(query(null));
    models.UsageCounter.updateOne.mockClear();
    expect(await settleMockSession("session-1", 241.2)).toBe(false);
    expect(models.UsageCounter.updateOne).not.toHaveBeenCalled();
  });

  it("releases a reservation without charge when the call never happened", async () => {
    models.MockInterviewSession.findOneAndUpdate.mockReturnValue(query({ ownerId: { toString: () => USER_ID }, periodKey: "pro:sub_123:p", reservedSeconds: 600 }));
    await settleMockSession("session-1", null);
    expect(models.UsageCounter.updateOne).toHaveBeenCalledWith(expect.anything(), { $inc: { mockSecondsReserved: -600, mockSecondsUsed: 0 } });
    expect(models.UsageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ type: "mock_released", amount: 0 }));
  });
});
