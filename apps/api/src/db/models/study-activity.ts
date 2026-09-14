import mongoose, { type Model, Schema, Types, model } from "mongoose";

/**
 * One compact document per user, kit, and calendar day. Keeping this as a
 * daily aggregate avoids storing an ever-growing clickstream while retaining
 * the exact data needed for the contribution-style study graph.
 */
export interface StudyActivityRecord {
  ownerId: Types.ObjectId;
  kitId: Types.ObjectId;
  /** ISO calendar date (YYYY-MM-DD), calculated in the user's supplied IANA zone. */
  day: string;
  flashcardReviews: number;
  lowConfidenceReviews: number;
  mediumConfidenceReviews: number;
  highConfidenceReviews: number;
  /** A deliberate "I showed up" signal; it contributes one effort unit. */
  checkedIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const studyActivitySchema = new Schema<StudyActivityRecord>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kitId: { type: Schema.Types.ObjectId, ref: "Kit", required: true, index: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    flashcardReviews: { type: Number, required: true, default: 0, min: 0 },
    lowConfidenceReviews: { type: Number, required: true, default: 0, min: 0 },
    mediumConfidenceReviews: { type: Number, required: true, default: 0, min: 0 },
    highConfidenceReviews: { type: Number, required: true, default: 0, min: 0 },
    checkedIn: { type: Boolean, required: true, default: false }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

studyActivitySchema.index({ ownerId: 1, kitId: 1, day: 1 }, { unique: true });
studyActivitySchema.index({ ownerId: 1, kitId: 1, day: -1 });

export const StudyActivity = (mongoose.models.StudyActivity as Model<StudyActivityRecord> | undefined)
  ?? model<StudyActivityRecord>("StudyActivity", studyActivitySchema);
