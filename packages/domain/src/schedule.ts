import type { Question, Requirement, ScheduleDay } from "./kit-schema";

export type Schedule = {
  days_available: number;
  days: ScheduleDay[];
};

export function buildSchedule(
  daysAvailable: number,
  questions: Question[],
  requirements: Requirement[]
): Schedule {
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1 || daysAvailable > 60) {
    throw new Error("daysAvailable must be an integer between 1 and 60.");
  }

  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const rankedQuestions = [...questions].sort((left, right) => {
    const priorityDifference = questionPriority(right, requirementById) - questionPriority(left, requirementById);
    if (priorityDifference !== 0) return priorityDifference;

    const difficultyDifference = right.difficulty - left.difficulty;
    if (difficultyDifference !== 0) return difficultyDifference;

    return left.id.localeCompare(right.id);
  });

  const buckets: Question[][] = Array.from({ length: daysAvailable }, () => []);
  if (rankedQuestions.length > 0) {
    if (rankedQuestions.length >= daysAvailable) {
      rankedQuestions.forEach((question, index) => {
        const targetDay = Math.floor((index * daysAvailable) / rankedQuestions.length);
        buckets[targetDay]?.push(question);
      });
    } else {
      rankedQuestions.forEach((question, index) => buckets[index]?.push(question));
      for (let dayIndex = rankedQuestions.length; dayIndex < daysAvailable; dayIndex += 1) {
        buckets[dayIndex]?.push(rankedQuestions[(dayIndex - rankedQuestions.length) % rankedQuestions.length]!);
      }
    }
  }

  return {
    days_available: daysAvailable,
    days: buckets.map((questionsForDay, index) => ({
      day: index + 1,
      focus: buildFocus(questionsForDay, index),
      question_ids: questionsForDay.map((question) => question.id),
      minutes: questionsForDay.length === 0 ? 20 : questionsForDay.length * 20
    }))
  };
}

function questionPriority(question: Question, requirements: Map<string, Requirement>): number {
  return question.requirement_ids.some((id) => requirements.get(id)?.priority === "must") ? 1 : 0;
}

function buildFocus(questions: Question[], index: number): string {
  if (questions.length === 0) return "Review role context and research findings";

  const category = questions[0]?.category;
  const label: Record<Question["category"], string> = {
    technical: "Strengthen technical foundations",
    behavioural: "Prepare behavioural stories",
    "system-design": "Practise system design reasoning",
    "company-fit": "Connect preparation to company context"
  };

  return index === 0 ? `Start with priority material: ${label[category!]}` : label[category!];
}
