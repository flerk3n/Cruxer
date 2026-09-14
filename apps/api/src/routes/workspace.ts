import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { Kit } from "../db/models/kit.js";
import { PracticeProgress } from "../db/models/practice-progress.js";
import { StudyActivity } from "../db/models/study-activity.js";
import { storedConfidenceScore, type PracticeConfidence } from "../lib/practice-score.js";
import { DEFAULT_ACTIVITY_DAYS, DEFAULT_TIME_ZONE, MAX_ACTIVITY_DAYS, addCalendarDays, assertTimeZone, buildActivitySeries, calendarDayAt } from "../lib/study-activity.js";
import { requireAuth } from "../middleware/auth.js";

const querySchema = z.object({
  days: z.coerce.number().int().min(7).max(MAX_ACTIVITY_DAYS).default(DEFAULT_ACTIVITY_DAYS),
  timeZone: z.string().trim().min(1).max(80).transform((value, ctx) => {
    try { return assertTimeZone(value); } catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use a valid IANA time zone." }); return z.NEVER; }
  }).default(DEFAULT_TIME_ZONE)
}).strict();

type ReadyKit = {
  _id: { toString(): string };
  kit?: { source?: { company?: string }; role?: { title?: string }; questions?: unknown[]; flashcards?: Array<{ id?: string }> };
};
type ProgressRecord = { kitId: { toString(): string }; flashcardId: string; lastConfidence?: PracticeConfidence; confidenceScore?: number };

/** User-scoped dashboard data. Activity is intentionally aggregated across kits. */
export function createWorkspaceRouter(config: AppConfig): Router {
  const router = Router();
  router.use(requireAuth(config));

  router.get("/overview", async (req, res, next) => {
    try {
      const { days, timeZone } = querySchema.parse(req.query);
      const ownerId = req.auth!.userId;
      const today = calendarDayAt(new Date(), timeZone);
      const from = addCalendarDays(today, -(days - 1));
      const [kits, progress, activity] = await Promise.all([
        Kit.find({ ownerId, status: "ready" }).select("kit").lean() as Promise<ReadyKit[]>,
        PracticeProgress.find({ ownerId }).select("kitId flashcardId lastConfidence confidenceScore").lean() as Promise<ProgressRecord[]>,
        StudyActivity.find({ ownerId, day: { $gte: from, $lte: today } }).select("day flashcardReviews lowConfidenceReviews mediumConfidenceReviews highConfidenceReviews checkedIn").lean()
      ]);
      const progressByCard = new Map(progress.map((entry) => [`${entry.kitId.toString()}:${entry.flashcardId}`, entry]));
      const kitMetrics = kits.map((kit) => {
        const flashcards = kit.kit?.flashcards ?? [];
        const cardProgress = flashcards.map((card) => card.id ? progressByCard.get(`${kit._id.toString()}:${card.id}`) : undefined);
        const reviewedCards = cardProgress.filter(Boolean).length;
        const totalCards = flashcards.length;
        const confidencePoints = cardProgress.reduce((total, entry) => total + (entry ? storedConfidenceScore(entry) : 0), 0);
        return {
          kitId: kit._id.toString(),
          company: kit.kit?.source?.company ?? "Company research pending",
          roleTitle: kit.kit?.role?.title ?? "Preparation kit",
          totalCards,
          reviewedCards,
          progressPercent: totalCards === 0 ? 0 : Math.round(reviewedCards / totalCards * 100),
          confidencePercent: totalCards === 0 ? 0 : Math.round(confidencePoints / totalCards),
          questionCount: kit.kit?.questions?.length ?? 0
        };
      });
      const totalCards = kitMetrics.reduce((total, kit) => total + kit.totalCards, 0);
      const reviewedCards = kitMetrics.reduce((total, kit) => total + kit.reviewedCards, 0);
      const aggregate = new Map<string, { day: string; flashcardReviews: number; lowConfidenceReviews: number; mediumConfidenceReviews: number; highConfidenceReviews: number; checkedIn: boolean }>();
      for (const entry of activity) {
        const current = aggregate.get(entry.day) ?? { day: entry.day, flashcardReviews: 0, lowConfidenceReviews: 0, mediumConfidenceReviews: 0, highConfidenceReviews: 0, checkedIn: false };
        current.flashcardReviews += entry.flashcardReviews;
        current.lowConfidenceReviews += entry.lowConfidenceReviews;
        current.mediumConfidenceReviews += entry.mediumConfidenceReviews;
        current.highConfidenceReviews += entry.highConfidenceReviews;
        current.checkedIn ||= entry.checkedIn;
        aggregate.set(entry.day, current);
      }
      const series = buildActivitySeries(from, days, [...aggregate.values()]);
      res.json({
        overview: {
          activeKits: kitMetrics.length,
          totalCards,
          reviewedCards,
          totalQuestions: kitMetrics.reduce((total, kit) => total + kit.questionCount, 0),
          progressPercent: totalCards === 0 ? 0 : Math.round(reviewedCards / totalCards * 100),
          confidencePercent: totalCards === 0 ? 0 : Math.round(kitMetrics.reduce((total, kit) => total + kit.confidencePercent * kit.totalCards, 0) / totalCards)
        },
        kits: kitMetrics,
        activity: { timeZone, range: { from, to: today, days }, series, today: series.at(-1) }
      });
    } catch (error) { next(error); }
  });

  return router;
}
