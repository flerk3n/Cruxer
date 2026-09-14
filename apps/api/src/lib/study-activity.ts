import type { PersistedKitPayload } from "./kit-validation.js";

export const DEFAULT_ACTIVITY_DAYS = 84;
export const MAX_ACTIVITY_DAYS = 365;
export const DEFAULT_TIME_ZONE = "UTC";

export interface ActivityDay {
  date: string;
  flashcardReviews: number;
  confidence: { low: number; medium: number; high: number };
  checkedIn: boolean;
  /** One unit per review, plus one for a deliberate daily check-in. */
  effortUnits: number;
}

interface ActivityAggregate {
  day: string;
  flashcardReviews: number;
  lowConfidenceReviews: number;
  mediumConfidenceReviews: number;
  highConfidenceReviews: number;
  checkedIn: boolean;
}

export function assertTimeZone(value: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    throw new Error("Invalid IANA time zone.");
  }
}

export function calendarDayAt(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addCalendarDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, date! + amount));
  return value.toISOString().slice(0, 10);
}

export function calendarDayDifference(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

export function buildActivitySeries(
  from: string,
  days: number,
  activity: ActivityAggregate[]
): ActivityDay[] {
  const byDay = new Map(activity.map((entry) => [entry.day, entry]));
  return Array.from({ length: days }, (_, index) => {
    const date = addCalendarDays(from, index);
    const entry = byDay.get(date);
    const flashcardReviews = entry?.flashcardReviews ?? 0;
    const checkedIn = entry?.checkedIn ?? false;
    return {
      date,
      flashcardReviews,
      confidence: {
        low: entry?.lowConfidenceReviews ?? 0,
        medium: entry?.mediumConfidenceReviews ?? 0,
        high: entry?.highConfidenceReviews ?? 0
      },
      checkedIn,
      effortUnits: flashcardReviews + (checkedIn ? 1 : 0)
    };
  });
}

export function buildScheduleSummary(
  kit: PersistedKitPayload | undefined,
  createdAt: Date,
  today: string,
  timeZone: string
): Record<string, unknown> | null {
  if (!kit) return null;

  const startedOn = calendarDayAt(createdAt, timeZone);
  const totalDays = kit.schedule.days_available;
  const rawDayNumber = calendarDayDifference(startedOn, today) + 1;
  const deadline = addCalendarDays(startedOn, totalDays - 1);
  const activeDayNumber = Math.min(Math.max(rawDayNumber, 1), totalDays);
  const scheduleDay = kit.schedule.days[activeDayNumber - 1]!;

  return {
    startedOn,
    deadline,
    totalDays,
    dayNumber: activeDayNumber,
    daysRemaining: Math.max(0, calendarDayDifference(today, deadline)),
    status: rawDayNumber > totalDays ? "complete" : "active",
    focus: scheduleDay.focus,
    minutes: scheduleDay.minutes,
    questionCount: scheduleDay.question_ids.length
  };
}
