import mongoose, { type Model, Schema, Types, model } from "mongoose";

export type MockInterviewStatus = "created" | "active" | "ending" | "completed" | "evaluating" | "ready" | "failed";

export interface MockInterviewTranscriptTurn {
  speaker: "agent" | "user";
  text: string;
  at?: Date;
}

export interface MockInterviewSessionRecord {
  ownerId: Types.ObjectId;
  kitId: Types.ObjectId;
  selectedQuestionIds: string[];
  status: MockInterviewStatus;
  providerConversationId?: string;
  transcript: MockInterviewTranscriptTurn[];
  report?: {
    overallScore: number;
    dimensions: { relevance: number; structure: number; evidence: number; clarity: number };
    summary: string;
    strengths: string[];
    gaps: string[];
    nextSteps: string[];
  };
  startedAt?: Date;
  endedAt?: Date;
  failure?: { code: string; message: string };
  createdAt: Date;
  updatedAt: Date;
}

const transcriptTurnSchema = new Schema<MockInterviewTranscriptTurn>(
  {
    speaker: { type: String, enum: ["agent", "user"], required: true },
    text: { type: String, required: true, maxlength: 8_000 },
    at: Date
  },
  { _id: false, strict: "throw" }
);

const mockInterviewSessionSchema = new Schema<MockInterviewSessionRecord>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kitId: { type: Schema.Types.ObjectId, ref: "Kit", required: true, index: true },
    selectedQuestionIds: { type: [String], required: true, validate: [(value: string[]) => value.length >= 1 && value.length <= 5, "Select between one and five questions."] },
    status: { type: String, enum: ["created", "active", "ending", "completed", "evaluating", "ready", "failed"], required: true, index: true },
    providerConversationId: { type: String, unique: true, sparse: true, maxlength: 160 },
    transcript: { type: [transcriptTurnSchema], default: [] },
    report: {
      overallScore: { type: Number, min: 0, max: 100 },
      dimensions: {
        relevance: { type: Number, min: 0, max: 100 },
        structure: { type: Number, min: 0, max: 100 },
        evidence: { type: Number, min: 0, max: 100 },
        clarity: { type: Number, min: 0, max: 100 }
      },
      summary: { type: String, maxlength: 1_200 },
      strengths: { type: [String], default: undefined },
      gaps: { type: [String], default: undefined },
      nextSteps: { type: [String], default: undefined }
    },
    startedAt: Date,
    endedAt: Date,
    failure: { code: { type: String, maxlength: 100 }, message: { type: String, maxlength: 500 } }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

mockInterviewSessionSchema.index({ ownerId: 1, kitId: 1, createdAt: -1 });

export const MockInterviewSession = (mongoose.models.MockInterviewSession as Model<MockInterviewSessionRecord> | undefined)
  ?? model<MockInterviewSessionRecord>("MockInterviewSession", mockInterviewSessionSchema);
