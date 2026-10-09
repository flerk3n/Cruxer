import mongoose, { type Model, Schema, Types, model } from "mongoose";

export type UsageEventType = "kit_reserved" | "kit_refunded" | "mock_reserved" | "mock_settled" | "mock_released";

/**
 * Append-only usage ledger. The unique (type, refId) index makes every quota
 * mutation idempotent and doubles as the source for usage/cost reporting.
 */
export interface UsageEventRecord {
  userId: Types.ObjectId;
  type: UsageEventType;
  /** Kits for kit events, seconds for mock events. */
  amount: number;
  /** Generation run id or mock interview session id. */
  refId: string;
  periodKey: string;
  plan: "free" | "pro";
  createdAt: Date;
}

const usageEventSchema = new Schema<UsageEventRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["kit_reserved", "kit_refunded", "mock_reserved", "mock_settled", "mock_released"], required: true },
    amount: { type: Number, required: true, min: 0 },
    refId: { type: String, required: true, maxlength: 160 },
    periodKey: { type: String, required: true, maxlength: 200 },
    plan: { type: String, enum: ["free", "pro"], required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw" }
);

usageEventSchema.index({ type: 1, refId: 1 }, { unique: true });
usageEventSchema.index({ createdAt: -1 });

export const UsageEvent = (mongoose.models.UsageEvent as Model<UsageEventRecord> | undefined)
  ?? model<UsageEventRecord>("UsageEvent", usageEventSchema);
