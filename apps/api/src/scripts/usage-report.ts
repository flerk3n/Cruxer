/**
 * Monthly usage and unit-economics report from the usage ledger.
 *
 *   npm run usage-report --workspace @cruxer/api -- --month 2026-10
 *
 * Cost constants are estimates; update them when provider pricing changes.
 */
import { parseArgs } from "node:util";
import { PLANS } from "../billing/plans.js";
import { connectDatabase, disconnectDatabase } from "../db/connect.js";
import { Subscription } from "../db/models/subscription.js";
import { UsageEvent } from "../db/models/usage-event.js";
import { User } from "../db/models/user.js";

const EST_COST_PER_KIT_USD = 0.10;
const EST_COST_PER_VOICE_MINUTE_USD = 0.10;
const EST_DODO_FEE_PER_PAYMENT_USD = PLANS.pro.priceUsdMonthly * 0.06 + 0.40;

const { values } = parseArgs({ options: { month: { type: "string" } } });
const now = new Date();
const month = values.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Use --month YYYY-MM.");
const [year, monthIndex] = month.split("-").map(Number) as [number, number];
const from = new Date(Date.UTC(year, monthIndex - 1, 1));
const to = new Date(Date.UTC(year, monthIndex, 1));

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required.");
await connectDatabase(uri);
try {
  const rows = await UsageEvent.aggregate<{ _id: { plan: string; type: string }; amount: number; events: number; users: string[] }>([
    { $match: { createdAt: { $gte: from, $lt: to } } },
    { $group: { _id: { plan: "$plan", type: "$type" }, amount: { $sum: "$amount" }, events: { $sum: 1 }, users: { $addToSet: "$userId" } } }
  ]);
  const get = (plan: string, type: string) => rows.find((row) => row._id.plan === plan && row._id.type === type);
  const kits = (plan: string) => (get(plan, "kit_reserved")?.amount ?? 0) - (get(plan, "kit_refunded")?.amount ?? 0);
  const voiceMinutes = (plan: string) => ((get(plan, "mock_settled")?.amount ?? 0)) / 60;
  const [newUsers, verifiedUsers, activePro] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: from, $lt: to } }),
    User.countDocuments({ createdAt: { $gte: from, $lt: to }, emailVerifiedAt: { $exists: true } }),
    Subscription.countDocuments({ status: { $in: ["active", "past_due"] } })
  ]);

  const report = (["free", "pro"] as const).map((plan) => {
    const kitCount = kits(plan);
    const minutes = voiceMinutes(plan);
    return {
      plan,
      activeUsers: get(plan, "kit_reserved")?.users.length ?? 0,
      kitsGenerated: kitCount,
      kitsRefunded: get(plan, "kit_refunded")?.amount ?? 0,
      voiceMinutes: Number(minutes.toFixed(1)),
      estimatedCostUsd: Number((kitCount * EST_COST_PER_KIT_USD + minutes * EST_COST_PER_VOICE_MINUTE_USD).toFixed(2))
    };
  });
  const proCost = report.find((row) => row.plan === "pro")?.estimatedCostUsd ?? 0;
  const netRevenue = activePro * (PLANS.pro.priceUsdMonthly - EST_DODO_FEE_PER_PAYMENT_USD);
  console.log(JSON.stringify({
    month,
    signups: { newUsers, verifiedUsers },
    activeProSubscriptions: activePro,
    usage: report,
    estimate: {
      proNetRevenueUsd: Number(netRevenue.toFixed(2)),
      proVariableCostUsd: proCost,
      freeTierCostUsd: report.find((row) => row.plan === "free")?.estimatedCostUsd ?? 0,
      proGrossMarginUsd: Number((netRevenue - proCost).toFixed(2))
    }
  }, null, 2));
} finally {
  await disconnectDatabase();
}
