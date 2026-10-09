import mongoose, { type Model, Schema, Types, model } from "mongoose";

export type SubscriptionStatus = "pending" | "active" | "on_hold" | "paused" | "cancelled" | "failed" | "expired" | "past_due";

/**
 * Local mirror of the user's Dodo Payments subscription. It is always written from
 * a fresh provider read, never from a webhook payload alone, so out-of-order
 * deliveries cannot regress the stored state.
 */
export interface SubscriptionRecord {
  userId: Types.ObjectId;
  dodoSubscriptionId: string;
  dodoCustomerId: string;
  productId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<SubscriptionRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    dodoSubscriptionId: { type: String, required: true, unique: true, maxlength: 160 },
    dodoCustomerId: { type: String, required: true, maxlength: 160, index: true },
    productId: { type: String, required: true, maxlength: 160 },
    status: { type: String, enum: ["pending", "active", "on_hold", "paused", "cancelled", "failed", "expired", "past_due"], required: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, required: true, default: false },
    lastSyncedAt: { type: Date, required: true }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

export const Subscription = (mongoose.models.Subscription as Model<SubscriptionRecord> | undefined)
  ?? model<SubscriptionRecord>("Subscription", subscriptionSchema);
