import mongoose, { type Model, Schema, Types, model } from "mongoose";

/**
 * One row per user per usage period. Limits are enforced by conditional atomic
 * increments on this row, so concurrent requests can never overspend a quota.
 */
export interface UsageCounterRecord {
  userId: Types.ObjectId;
  /** `free:YYYY-MM` (UTC calendar month) or `pro:<subscriptionId>:<periodStartISO>`. */
  periodKey: string;
  kitsUsed: number;
  mockSecondsReserved: number;
  mockSecondsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const usageCounterSchema = new Schema<UsageCounterRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    periodKey: { type: String, required: true, maxlength: 200 },
    kitsUsed: { type: Number, required: true, default: 0, min: 0 },
    mockSecondsReserved: { type: Number, required: true, default: 0, min: 0 },
    mockSecondsUsed: { type: Number, required: true, default: 0, min: 0 }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

usageCounterSchema.index({ userId: 1, periodKey: 1 }, { unique: true });

export const UsageCounter = (mongoose.models.UsageCounter as Model<UsageCounterRecord> | undefined)
  ?? model<UsageCounterRecord>("UsageCounter", usageCounterSchema);
