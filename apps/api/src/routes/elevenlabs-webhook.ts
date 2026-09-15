import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { MockInterviewSession } from "../db/models/mock-interview-session.js";
import { evaluateMockInterview } from "../services/mock-interview-evaluator.js";

const transcriptTurnSchema = z.object({
  role: z.enum(["agent", "user"]),
  message: z.string().trim().min(1).max(8_000)
}).strict();
const webhookSchema = z.object({
  type: z.literal("post_call_transcription"),
  data: z.object({
    conversation_id: z.string().trim().min(1).max(160),
    transcript: z.array(transcriptTurnSchema).max(200)
  }).passthrough()
}).passthrough();

/** Public provider endpoint: validates HMAC over the untouched body before decoding JSON. */
export function createElevenLabsWebhookRouter(config: AppConfig): Router {
  const router = Router();
  router.post("/", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    if (!config.ELEVENLABS_WEBHOOK_SECRET || !verifySignature(req.body, req.header("elevenlabs-signature"), config.ELEVENLABS_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: "Invalid webhook signature." });
    }
    const parsed = webhookSchema.safeParse(parseBody(req.body));
    if (!parsed.success) return res.status(400).json({ error: "Invalid webhook payload." });

    const { conversation_id: providerConversationId, transcript } = parsed.data.data;
    const session = await MockInterviewSession.findOneAndUpdate(
      { providerConversationId, status: { $nin: ["ready", "evaluating"] } },
      {
        $set: {
          status: "evaluating",
          transcript: transcript.map((turn) => ({ speaker: turn.role, text: turn.message })),
          endedAt: new Date(),
          failure: undefined
        }
      },
      { new: true, runValidators: true }
    );

    // Always acknowledge valid, unmatched deliveries so unrelated workspace calls do not retry.
    res.status(200).json({ status: session ? "accepted" : "ignored" });
    if (session) void evaluateMockInterview(session._id.toString());
  });
  return router;
}
function parseBody(raw: unknown): unknown {
  if (!Buffer.isBuffer(raw)) return undefined;
  try { return JSON.parse(raw.toString("utf8")); } catch { return undefined; }
}

function verifySignature(raw: unknown, signature: string | undefined, secret: string): boolean {
  if (!Buffer.isBuffer(raw) || !signature) return false;
  const values = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)).filter(([key, value]) => key && value));
  const timestamp = values.t;
  const digest = values.v0;
  if (!timestamp || !digest || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1_000 - Number(timestamp)) > 30 * 60) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw.toString("utf8")}`).digest("hex");
  const receivedBuffer = Buffer.from(digest, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
