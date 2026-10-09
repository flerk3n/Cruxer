import mongoose, { HydratedDocument, type Model, Schema, model } from "mongoose";

export interface UserRecord {
  name?: string;
  email: string;
  passwordHash: string;
  /** Unset until the owner follows the emailed verification link. */
  emailVerifiedAt?: Date;
  /** Dodo Payments customer, linked by the first verified subscription webhook. */
  dodoCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserRecord>(
  {
    name: { type: String, required: false, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 320 },
    passwordHash: { type: String, required: true, select: false },
    emailVerifiedAt: { type: Date },
    dodoCustomerId: { type: String, maxlength: 160, index: true, sparse: true }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

export type UserDocument = HydratedDocument<UserRecord>;
export const User = (mongoose.models.User as Model<UserRecord> | undefined) ?? model<UserRecord>("User", userSchema);
