import mongoose, { type Model, Schema, Types, model } from "mongoose";

export type KitStatus = "draft" | "generating" | "ready" | "failed";

export interface KitRecord {
  ownerId: Types.ObjectId;
  /** Absent while the user has only saved the source material for a new kit. */
  kit?: Record<string, unknown>;
  generationInput?: { jd: string; companyUrl: string; days: number };
  status: KitStatus;
  generationRunId?: Types.ObjectId;
  revision: number;
  inputHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const kitSchema = new Schema<KitRecord>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // The API generation boundary validates this canonical Appendix A payload with Zod before writes.
    kit: { type: Schema.Types.Mixed },
    generationInput: {
      jd: { type: String, minlength: 1, maxlength: 50_000 },
      companyUrl: { type: String, maxlength: 2_048 },
      days: { type: Number, min: 1, max: 60 }
    },
    status: { type: String, enum: ["draft", "generating", "ready", "failed"], required: true },
    generationRunId: { type: Schema.Types.ObjectId, ref: "GenerationRun" },
    revision: { type: Number, required: true, default: 0, min: 0 },
    inputHash: { type: String, required: true, index: true }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

kitSchema.index({ ownerId: 1, inputHash: 1, status: 1 });

export const Kit = (mongoose.models.Kit as Model<KitRecord> | undefined) ?? model<KitRecord>("Kit", kitSchema);
