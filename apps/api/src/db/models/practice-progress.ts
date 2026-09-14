import mongoose, { type Model, Schema, Types, model } from "mongoose";

export interface PracticeProgressRecord {
  ownerId: Types.ObjectId;
  kitId: Types.ObjectId;
  flashcardId: string;
  lastConfidence?: 1 | 2 | 3;
  confidenceScore: number;
  attempts: number;
  lastReviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const practiceProgressSchema = new Schema<PracticeProgressRecord>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kitId: { type: Schema.Types.ObjectId, ref: "Kit", required: true, index: true },
    flashcardId: { type: String, required: true },
    lastConfidence: { type: Number, enum: [1, 2, 3] },
    confidenceScore: { type: Number, required: true, default: 0, min: 0, max: 100 },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    lastReviewedAt: Date
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

practiceProgressSchema.index({ ownerId: 1, kitId: 1, flashcardId: 1 }, { unique: true });

export const PracticeProgress = (mongoose.models.PracticeProgress as Model<PracticeProgressRecord> | undefined) ?? model<PracticeProgressRecord>("PracticeProgress", practiceProgressSchema);
