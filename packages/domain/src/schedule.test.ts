import { describe, expect, it } from "vitest";

import { buildSchedule } from "./schedule";
import type { Question, Requirement } from "./kit-schema";

const requirements: Requirement[] = [
  { id: "r1", text: "React", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentoring", kind: "behavioural", priority: "nice" },
  { id: "r3", text: "Architecture", kind: "technical", priority: "must" }
];

const questions: Question[] = [
  {
    id: "q1",
    requirement_ids: ["r1"],
    category: "technical",
    prompt: "React question",
    answer_outline: "React answer",
    difficulty: 2
  },
  {
    id: "q2",
    requirement_ids: ["r2"],
    category: "behavioural",
    prompt: "Mentoring question",
    answer_outline: "Mentoring answer",
    difficulty: 3
  },
  {
    id: "q3",
    requirement_ids: ["r3"],
    category: "system-design",
    prompt: "Architecture question",
    answer_outline: "Architecture answer",
    difficulty: 3
  }
];

describe("buildSchedule", () => {
  it("creates exactly one day with integer duration and all questions", () => {
    const schedule = buildSchedule(1, questions, requirements);

    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0]?.question_ids).toEqual(["q3", "q1", "q2"]);
    expect(schedule.days[0]?.minutes).toBe(60);
  });

  it("creates exactly sixty days and retains must-have material", () => {
    const schedule = buildSchedule(60, questions, requirements);
    const scheduledIds = new Set(schedule.days.flatMap((day) => day.question_ids));

    expect(schedule.days).toHaveLength(60);
    expect(schedule.days.every((day, index) => day.day === index + 1 && Number.isInteger(day.minutes))).toBe(true);
    expect(scheduledIds).toEqual(new Set(["q1", "q2", "q3"]));
  });

  it("orders must-have material before nice-to-have material", () => {
    const schedule = buildSchedule(3, questions, requirements);
    expect(schedule.days[0]?.question_ids).toEqual(["q3"]);
    expect(schedule.days[1]?.question_ids).toEqual(["q1"]);
    expect(schedule.days[2]?.question_ids).toEqual(["q2"]);
  });

  it("rejects an out-of-range number of days", () => {
    expect(() => buildSchedule(0, questions, requirements)).toThrow("daysAvailable");
    expect(() => buildSchedule(61, questions, requirements)).toThrow("daysAvailable");
  });
});
