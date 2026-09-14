import { type Model, Schema, Types, model, models } from "mongoose";

export type RunStatus = "queued" | "running" | "ready" | "failed" | "retryable";

export interface GenerationRunRecord {
  ownerId: Types.ObjectId;
  kitId?: Types.ObjectId;
  status: RunStatus;
  steps: Array<{ name: string; status: "pending" | "running" | "complete" | "warning" | "failed"; message?: string; startedAt?: Date; completedAt?: Date }>;
  warnings: Array<{ code: string; message: string; step?: string }>;
  retryCount: number;
  terminalError?: { code: string; message: string };
  createdAt: Date;
  updatedAt: Date;
}

const stepSchema = new Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ["pending", "running", "complete", "warning", "failed"], required: true },
    message: { type: String, maxlength: 500 },
    startedAt: Date,
    completedAt: Date
  },
  { _id: false, strict: "throw" }
);

const generationRunSchema = new Schema<GenerationRunRecord>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kitId: { type: Schema.Types.ObjectId, ref: "Kit", index: true },
    status: { type: String, enum: ["queued", "running", "ready", "failed", "retryable"], required: true },
    steps: { type: [stepSchema], default: [] },
    warnings: { type: [{ code: String, message: String, step: String }], default: [] },
    retryCount: { type: Number, required: true, default: 0, min: 0 },
    terminalError: { type: { code: String, message: String }, required: false }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

export const GenerationRun = (models.GenerationRun as Model<GenerationRunRecord> | undefined) ?? model<GenerationRunRecord>("GenerationRun", generationRunSchema);
