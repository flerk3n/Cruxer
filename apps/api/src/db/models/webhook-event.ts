import mongoose, { type Model, Schema, model } from "mongoose";

/** Delivery log used to process each provider webhook id at most once. */
export interface WebhookEventRecord {
  webhookId: string;
  provider: "dodo";
  type: string;
  processedAt?: Date;
  createdAt: Date;
}

const webhookEventSchema = new Schema<WebhookEventRecord>(
  {
    webhookId: { type: String, required: true, unique: true, maxlength: 200 },
    provider: { type: String, enum: ["dodo"], required: true },
    type: { type: String, required: true, maxlength: 120 },
    processedAt: Date
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw" }
);

// Retained long enough to absorb provider retries, then expired automatically.
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const WebhookEvent = (mongoose.models.WebhookEvent as Model<WebhookEventRecord> | undefined)
  ?? model<WebhookEventRecord>("WebhookEvent", webhookEventSchema);
