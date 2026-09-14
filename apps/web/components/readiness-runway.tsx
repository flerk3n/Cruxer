"use client";

import { useState } from "react";
import { ArrowRight, Check, Clock3, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ActivityDay, KitActivity } from "@/lib/api";
import { cn } from "@/lib/utils";

export type StudyDay = {
  day: number;
  focus: string;
  questionIds: string[];
  minutes: number;
};

type ReadinessRunwayProps = {
  plan: StudyDay[];
  activity?: KitActivity | null;
  activityError?: boolean;
  onOpenDay: (day: number) => void;
  onCheckIn?: () => void;
  checkingIn?: boolean;
  compact?: boolean;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function displayDate(day: ActivityDay): string {
  const date = new Date(`${day.date}T12:00:00`);
  return `${weekdayFormatter.format(date)}, ${dateFormatter.format(date)}`;
}

function intensity(units: number): string {
  if (units <= 0) return "bg-line";
  if (units === 1) return "bg-success/25";
  if (units === 2) return "bg-success/50";
  if (units <= 4) return "bg-success/75";
  return "bg-success";
}

function Timeline({ plan, currentDay, onOpenDay }: { plan: StudyDay[]; currentDay: number; onOpenDay: (day: number) => void }) {
  return <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="Study day timeline">
    {plan.map((day) => {
      const complete = day.day < currentDay;
      const current = day.day === currentDay;
      return <li key={day.day}>
        <button
          type="button"
          onClick={() => onOpenDay(day.day)}
          className={cn("group relative min-h-24 w-full overflow-hidden rounded-xl border p-3 text-left transition-colors motion-safe:duration-200 hover:bg-surface-raised", current && "border-signal/45 bg-signal/[0.045]", complete && "border-success/30")}
          aria-current={current ? "step" : undefined}
          aria-label={`Day ${day.day}: ${day.focus}. ${complete ? "Study day complete" : current ? "Current study day" : "Upcoming study day"}. Open this day.`}
        >
          <span className="flex items-center justify-between gap-2"><span className={cn("grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold", complete ? "bg-success text-white" : current ? "bg-signal text-white" : "bg-surface text-muted-ink ring-1 ring-line")}>
            {complete ? <Check size={13} aria-hidden="true" /> : day.day}
          </span><span className={cn("text-[11px] font-medium", current ? "text-signal-strong" : "text-muted-ink")}>{complete ? "Done" : current ? "Now" : `Day ${day.day}`}</span></span>
          <span className="mt-3 block line-clamp-2 text-xs font-medium leading-5">{day.focus}</span>
          <span className="mt-1 block text-[11px] text-muted-ink">{day.minutes} min</span>
        </button>
      </li>;
    })}
  </ol>;
}

function ActivityGraph({ activity, unavailable }: { activity?: KitActivity | null; unavailable?: boolean }) {
  const days = activity?.series ?? [];
  const [activeDay, setActiveDay] = useState<ActivityDay | null>(null);
  const active = activeDay ?? activity?.today ?? days.at(-1) ?? null;
  const hasActivity = days.some((day) => day.effortUnits > 0);

  return <div className="min-w-0">
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><div><p className="eyebrow">Daily effort</p><h3 className="mt-1 text-base font-semibold">Your recent practice rhythm</h3></div><span className="text-xs text-muted-ink">Last 5 weeks</span></div>
    {days.length > 0 ? <><div className="mt-5 overflow-x-auto pb-1" role="group" aria-label="Daily practice effort over the last five weeks">
      <div className="min-w-[18rem]">
        <div className="grid grid-flow-col grid-rows-5 gap-1.5" aria-describedby="effort-description">
          {days.map((day) => <button
            key={day.date}
            type="button"
            onFocus={() => setActiveDay(day)}
            onMouseEnter={() => setActiveDay(day)}
            onClick={() => setActiveDay(day)}
            className={cn("h-7 w-7 rounded-md ring-offset-2 transition-transform motion-safe:duration-150 hover:scale-110 focus-visible:scale-110", intensity(day.effortUnits), day.date === activity?.range.to && "ring-1 ring-ink/30")}
            aria-label={`${displayDate(day)}: ${day.effortUnits === 0 ? "no saved effort" : `${day.effortUnits} effort ${day.effortUnits === 1 ? "unit" : "units"}`}${day.checkedIn ? ", checked in" : ""}`}
          ><span className="sr-only">{displayDate(day)}</span></button>)}
        </div>
      </div>
    </div>
    <p id="effort-description" className="mt-3 min-h-5 text-xs text-muted-ink" aria-live="polite">{active ? `${displayDate(active)}: ${active.effortUnits === 0 ? "No saved effort" : `${active.effortUnits} effort ${active.effortUnits === 1 ? "unit" : "units"}`}${active.checkedIn ? ", checked in" : ""}.` : ""}</p>
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-ink" aria-label="Effort graph legend"><span>Less</span>{[0, 1, 2, 3, 5].map((value) => <i key={value} className={cn("h-3.5 w-3.5 rounded-[3px]", intensity(value))} aria-hidden="true" />)}<span>More</span></div>
    {!hasActivity && <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-xs leading-5 text-muted-ink">Record confidence after a flashcard to start your effort history. Cruxer only shows saved activity—it does not fill in missed days.</p>}</> : <div className="mt-5 rounded-xl bg-canvas px-3 py-5 text-xs leading-5 text-muted-ink">{unavailable ? "Daily effort could not be loaded. Your study plan is still available below." : "Loading your saved activity…"}</div>}
  </div>;
}

/** A server-backed readiness view that never invents a deadline or activity. */
export function ReadinessRunway({ plan, activity, activityError, onOpenDay, onCheckIn, checkingIn, compact = false }: ReadinessRunwayProps) {
  const totalDays = plan.length;
  const summary = activity?.schedule;
  const currentDay = summary?.dayNumber ?? 1;
  const current = plan.find((day) => day.day === currentDay) ?? plan[0];
  const remaining = summary?.daysRemaining;

  if (!current || totalDays === 0) return null;

  if (compact) return <section className="mt-7"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Readiness runway</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Day {currentDay} of {totalDays}</h2></div><span className="text-sm text-muted-ink">{remaining === undefined ? "Schedule summary loading" : remaining === 0 ? "Plan complete" : `${remaining} study ${remaining === 1 ? "day" : "days"} left`}</span></div><Timeline plan={plan} currentDay={currentDay} onOpenDay={onOpenDay} /></section>;

  return <section aria-labelledby="runway-heading"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Readiness runway</p><h2 id="runway-heading" className="mt-1 text-xl font-semibold tracking-tight">A calmer way to see the work ahead.</h2></div><p className="max-w-xs text-sm leading-6 text-muted-ink">Your schedule is measured in study days, not an assumed interview date.</p></div>
    <Card className="mt-4 overflow-hidden p-5 sm:p-6"><div className="grid gap-7 xl:grid-cols-[minmax(0,0.9fr)_minmax(20rem,1.1fr)] xl:gap-10"><div><div className="flex items-center gap-2 text-signal"><Sparkles size={16} aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-[0.1em]">Today’s next move</span></div><div className="mt-4 flex items-baseline gap-3"><span className="editorial-title text-5xl leading-none">{currentDay}</span><span className="text-sm text-muted-ink">of {totalDays} study days</span></div><h3 className="mt-4 text-lg font-semibold">{summary?.focus ?? current.focus}</h3><p className="mt-2 text-sm leading-6 text-muted-ink">{summary?.questionCount ?? current.questionIds.length} {(summary?.questionCount ?? current.questionIds.length) === 1 ? "prompt" : "prompts"} · {summary?.minutes ?? current.minutes} focused minutes. {remaining === undefined ? "Your timeline is reconnecting." : remaining === 0 ? "You have reached the end of this plan; revisit any day that needs another pass." : `${remaining} study ${remaining === 1 ? "day" : "days"} remain in this plan.`}</p><div className="mt-5 flex flex-wrap gap-2"><Button size="sm" onClick={() => onOpenDay(current.day)}>Open Day {current.day} <ArrowRight size={15} /></Button>{onCheckIn && <Button size="sm" variant="secondary" onClick={onCheckIn} disabled={checkingIn || activity?.today?.checkedIn}>{activity?.today?.checkedIn ? "Checked in today" : checkingIn ? "Saving check-in…" : "Mark today intentional"}</Button>}</div></div><ActivityGraph activity={activity} unavailable={activityError} /></div>
      <div className="mt-7 border-t pt-6"><Timeline plan={plan} currentDay={currentDay} onOpenDay={onOpenDay} /></div>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-ink"><Clock3 size={14} aria-hidden="true" />Your current study day and countdown come from this kit’s saved timeline.</div>
    </Card>
  </section>;
}
