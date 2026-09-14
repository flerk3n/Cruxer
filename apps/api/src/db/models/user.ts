import mongoose, { HydratedDocument, type Model, Schema, model } from "mongoose";

export interface UserRecord {
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserRecord>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 320 },
    passwordHash: { type: String, required: true, select: false }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

userSchema.index({ email: 1 }, { unique: true });

export type UserDocument = HydratedDocument<UserRecord>;
export const User = (mongoose.models.User as Model<UserRecord> | undefined) ?? model<UserRecord>("User", userSchema);
