import mongoose, { type Model, Schema, Types, model } from "mongoose";

export type RunStatus = "queued" | "running" | "ready" | "failed" | "retryable";

export interface GenerationRunRecord {
  ownerId: Types.ObjectId;
  kitId?: Types.ObjectId;
  inputHash: string;
  input: { jd: string; companyUrl: string; days: number };
  status: RunStatus;
  steps: Array<{ name: string; status: "pending" | "running" | "complete" | "warning" | "failed"; message?: string; startedAt?: Date; completedAt?: Date }>;
  warnings: Array<{ code: string; message: string; step?: string }>;
  retryCount: number;
  terminalError?: { code: string; message: string };
  regeneration?: { section: "questions" | "flashcards" | "company-brief" | "schedule"; category?: "technical" | "behavioural" | "system-design" | "company-fit" };
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
    inputHash: { type: String, required: true },
    input: {
      jd: { type: String, required: true, minlength: 1, maxlength: 50_000 },
      companyUrl: { type: String, required: true, maxlength: 2_048 },
      days: { type: Number, required: true, min: 1, max: 60 }
    },
    status: { type: String, enum: ["queued", "running", "ready", "failed", "retryable"], required: true },
    steps: { type: [stepSchema], default: [] },
    warnings: { type: [{ code: String, message: String, step: String }], default: [] },
    retryCount: { type: Number, required: true, default: 0, min: 0 },
    terminalError: { type: { code: String, message: String }, required: false },
    regeneration: {
      section: { type: String, enum: ["questions", "flashcards", "company-brief", "schedule"] },
      category: { type: String, enum: ["technical", "behavioural", "system-design", "company-fit"] }
    }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

// Only one in-flight attempt for a user's identical source material can exist,
// including across concurrent HTTP requests handled by separate app instances.
generationRunSchema.index(
  { ownerId: 1, inputHash: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["queued", "running"] } } }
);

export const GenerationRun = (mongoose.models.GenerationRun as Model<GenerationRunRecord> | undefined) ?? model<GenerationRunRecord>("GenerationRun", generationRunSchema);
