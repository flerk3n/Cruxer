import mongoose, { type Model, Schema, Types, model } from "mongoose";

/** Only the SHA-256 hash of the emailed token is stored. */
export interface EmailVerificationTokenRecord {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

const emailVerificationTokenSchema = new Schema<EmailVerificationTokenRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, maxlength: 128 },
    expiresAt: { type: Date, required: true },
    usedAt: Date
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw" }
);

emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationToken = (mongoose.models.EmailVerificationToken as Model<EmailVerificationTokenRecord> | undefined)
  ?? model<EmailVerificationTokenRecord>("EmailVerificationToken", emailVerificationTokenSchema);
