"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  GripVertical,
  Layers3,
  ListChecks,
  Pencil,
  RotateCcw,
  Sparkles,
  X
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

type View = "overview" | "questions" | "flashcards" | "schedule";
type Category = "all" | Question["category"];

type Question = {
  id: string;
  category: "technical" | "behavioural" | "system-design" | "company-fit";
  prompt: string;
  answer: string;
  requirementIds: string[];
  difficulty: 1 | 2 | 3;
  edited?: boolean;
};

type Flashcard = { id: string; front: string; back: string; requirement: string };

const requirements = [
  { id: "r1", text: "Lead frontend architecture across product teams", priority: "Must" },
  { id: "r2", text: "Build accessible, high-quality user experiences", priority: "Must" },
  { id: "r3", text: "Make thoughtful React and TypeScript trade-offs", priority: "Must" },
  { id: "r4", text: "Partner clearly with design and product", priority: "Nice" }
];

const initialQuestions: Question[] = [
  {
    id: "q1",
    category: "technical",
    prompt: "How would you structure a complex React application so teams can move independently?",
    answer: "Start with clear domain boundaries and ownership. Keep shared primitives deliberately small, define dependency rules, and use a gradual migration path rather than a rewrite.",
    requirementIds: ["r1", "r3"],
    difficulty: 2
  },
  {
    id: "q2",
    category: "technical",
    prompt: "When would you choose server state over local client state, and how would you keep it reliable?",
    answer: "Separate remote cache concerns from ephemeral UI state. Explain invalidation, loading and error states, then connect the choice to the product interaction.",
    requirementIds: ["r3"],
    difficulty: 2
  },
  {
    id: "q3",
    category: "technical",
    prompt: "Walk us through an accessibility issue you found late in a release and how you resolved it.",
    answer: "Describe the user impact first, then the semantic or interaction issue, test coverage, and the guardrail you added so it did not return.",
    requirementIds: ["r2"],
    difficulty: 1,
    edited: true
  },
  {
    id: "q4",
    category: "behavioural",
    prompt: "Tell me about a time you changed a technical direction after hearing a different perspective.",
    answer: "Use a specific disagreement. Establish the decision context, what you learned, the decision you made, and how you brought the group along.",
    requirementIds: ["r4"],
    difficulty: 2
  },
  {
    id: "q5",
    category: "system-design",
    prompt: "Design a resilient experiment framework for a web product used by several teams.",
    answer: "Clarify exposure, assignment, targeting, data quality, rollback, and the developer workflow before selecting storage or delivery details.",
    requirementIds: ["r1", "r3"],
    difficulty: 3
  },
  {
    id: "q6",
    category: "company-fit",
    prompt: "What about Atlas's product and stage makes this role a useful next step for you?",
    answer: "Tie one product observation to the role's ownership model and one concrete way your past work would help the team now.",
    requirementIds: ["r4"],
    difficulty: 1
  }
];

const flashcards: Flashcard[] = [
  { id: "f1", front: "What is the first architecture concern to clarify?", back: "Team and domain boundaries: who owns a change, what can be shared, and where dependencies are allowed.", requirement: "Frontend architecture" },
  { id: "f2", front: "How do you make accessibility work durable?", back: "Pair semantic implementation with keyboard checks, automated coverage, and review criteria that catch regressions before release.", requirement: "Accessible experiences" },
  { id: "f3", front: "What makes an experiment platform trustworthy?", back: "Stable assignment, explicit exposure logging, data-quality checks, guardrails, and a simple rollback path.", requirement: "Systems thinking" }
];

const schedule = [
  { day: 1, focus: "Role signals and React foundations", minutes: 55, questionIds: ["q1", "q2"] },
  { day: 2, focus: "Accessibility and collaboration stories", minutes: 45, questionIds: ["q3", "q4"] },
  { day: 3, focus: "Architecture rehearsal", minutes: 60, questionIds: ["q5"] },
  { day: 4, focus: "Company narrative and gaps", minutes: 40, questionIds: ["q6", "q4"] },
  { day: 5, focus: "Timed final practice", minutes: 55, questionIds: ["q1", "q5", "q6"] }
];

const categoryLabels: Record<Exclude<Category, "all">, string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  "system-design": "System design",
  "company-fit": "Company fit"
};

const viewItems: Array<{ id: View; label: string; icon: typeof FileText }> = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "questions", label: "Questions", icon: ListChecks },
  { id: "flashcards", label: "Flashcards", icon: Layers3 },
  { id: "schedule", label: "Study plan", icon: Clock3 }
];

export function KitBuilder() {
  const root = useRef<HTMLDivElement>(null);
  const canAnimate = useRef(false);
  const { contextSafe } = useGSAP({ scope: root });
  const [view, setView] = useState<View>("overview");
  const [questions, setQuestions] = useState(initialQuestions);
  const [category, setCategory] = useState<Category>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ prompt: "", answer: "" });
  const [savedId, setSavedId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<Exclude<Category, "all"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [reviewed, setReviewed] = useState(3);
  const [expandedDay, setExpandedDay] = useState(1);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      canAnimate.current = true;
      return () => { canAnimate.current = false; };
    });
    return () => media.revert();
  }, { scope: root });

  const visibleQuestions = useMemo(
    () => questions.filter((question) => category === "all" || question.category === category),
    [category, questions]
  );
  const activeFlashcard = flashcards[flashcardIndex]!;

  useEffect(() => {
    if (view !== "flashcards") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a")) return;
      if (event.code === "Space") { event.preventDefault(); setRevealed((value) => !value); }
      if (revealed && ["1", "2", "3"].includes(event.key)) { event.preventDefault(); recordConfidence(event.key); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, view]);

  const animateReorder = contextSafe((questionId: string, direction: number) => {
    if (!canAnimate.current) return;
    const card = root.current?.querySelector<HTMLElement>(`[data-question-id="${questionId}"]`);
    if (!card) return;
    gsap.fromTo(card, { autoAlpha: 0.72, y: direction * -8 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out", clearProps: "transform,opacity,visibility" });
  });

  function startEditing(question: Question) {
    setEditingId(question.id);
    setDraft({ prompt: question.prompt, answer: question.answer });
  }

  function cancelEditing() {
    setEditingId(null);
    setDraft({ prompt: "", answer: "" });
  }

  function saveQuestion(questionId: string) {
    setQuestions((current) => current.map((question) => question.id === questionId
      ? { ...question, prompt: draft.prompt.trim() || question.prompt, answer: draft.answer.trim() || question.answer, edited: true }
      : question));
    setEditingId(null);
    setSavedId(questionId);
    setNotice("Question saved locally. It will sync when the kit API is connected.");
    window.setTimeout(() => setSavedId((current) => current === questionId ? null : current), 1800);
  }

  function moveQuestion(questionId: string, direction: -1 | 1) {
    const visibleIndex = visibleQuestions.findIndex((question) => question.id === questionId);
    const swapWith = visibleQuestions[visibleIndex + direction];
    if (!swapWith) return;
    setQuestions((current) => {
      const sourceIndex = current.findIndex((question) => question.id === questionId);
      const targetIndex = current.findIndex((question) => question.id === swapWith.id);
      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex]!, next[sourceIndex]!];
      return next;
    });
    animateReorder(questionId, direction);
    setNotice(`Moved question ${direction < 0 ? "up" : "down"}.`);
  }

  function confirmRegeneration() {
    if (!regenerating) return;
    const changedCategory = regenerating;
    setQuestions((current) => current.map((question) => {
      if (question.category !== changedCategory || question.edited) return question;
      return { ...question, prompt: `${question.prompt} (refreshed for Atlas)`, answer: question.answer };
    }));
    setRegenerating(null);
    setNotice(`${categoryLabels[changedCategory]} questions refreshed. Your edited questions stayed in place.`);
  }

  function recordConfidence(value: string) {
    const label = value === "1" ? "Not yet" : value === "2" ? "Getting there" : "Confident";
    setReviewed((current) => Math.min(12, current + 1));
    setRevealed(false);
    setFlashcardIndex((current) => (current + 1) % flashcards.length);
    setNotice(`${label} recorded. Next card ready.`);
  }

  return <div ref={root} className="pb-4">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div>
        <p className="eyebrow">Preparation kit</p>
        <h1 className="mt-1 text-[clamp(1.7rem,4vw,2rem)] font-semibold tracking-tight">Atlas · Senior Frontend Engineer</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-ink"><StatusPill status="ready" /><span>Saved just now</span><span aria-hidden="true">·</span><span>5 days remaining</span></div>
      </div>
      <Button onClick={() => setView("flashcards")}><BookOpenCheck size={16} />Practice</Button>
    </div>

    <div className="mt-6 grid gap-8 lg:grid-cols-[11.5rem_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto border-b pb-2 lg:block lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4" aria-label="Kit sections">
        {viewItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setView(id)} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[13px] font-medium transition-colors lg:flex lg:w-full", view === id ? "bg-surface text-ink shadow-sm" : "text-muted-ink hover:bg-surface-raised hover:text-ink")} aria-current={view === id ? "page" : undefined}><Icon size={16} />{label}</button>)}
      </nav>
      <main className="min-w-0" aria-live="polite">
        {view === "overview" && <Overview onOpenQuestions={() => setView("questions")} onOpenSchedule={() => setView("schedule")} />}
        {view === "questions" && <QuestionsView
          category={category}
          editingId={editingId}
          draft={draft}
          questions={visibleQuestions}
          allQuestions={questions}
          savedId={savedId}
          onCategory={setCategory}
          onDraft={setDraft}
          onEdit={startEditing}
          onCancel={cancelEditing}
          onSave={saveQuestion}
          onMove={moveQuestion}
          onRegenerate={setRegenerating}
        />}
        {view === "flashcards" && <FlashcardsView card={activeFlashcard} index={flashcardIndex} revealed={revealed} reviewed={reviewed} onReveal={() => setRevealed(true)} onConfidence={recordConfidence} onRestart={() => { setFlashcardIndex(0); setReviewed(0); setRevealed(false); setNotice("Practice session restarted."); }} />}
        {view === "schedule" && <ScheduleView expandedDay={expandedDay} onToggle={setExpandedDay} questions={questions} />}
      </main>
    </div>

    {notice && <div className="fixed bottom-20 right-4 z-30 max-w-sm rounded-float border bg-surface px-4 py-3 text-sm shadow-ambient lg:bottom-6" role="status"><div className="flex items-start gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink" aria-label="Dismiss message"><X size={15} /></button></div></div>}
    {regenerating && <RegenerationDialog category={regenerating} editedCount={questions.filter((question) => question.category === regenerating && question.edited).length} replaceCount={questions.filter((question) => question.category === regenerating && !question.edited).length} onCancel={() => setRegenerating(null)} onConfirm={confirmRegeneration} />}
  </div>;
}

function Overview({ onOpenQuestions, onOpenSchedule }: { onOpenQuestions: () => void; onOpenSchedule: () => void }) {
  return <div className="space-y-8">
    <section><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Company brief</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Product context, not guesswork.</h2></div><Button variant="secondary" size="sm"><RotateCcw size={15} />Regenerate brief</Button></div><Card className="mt-4 p-5 sm:p-6"><p className="max-w-3xl text-[15px] leading-7">Atlas helps product teams turn complex customer signals into decisions. Its public materials consistently emphasise clear workflows, dependable collaboration, and shipping with confidence—useful cues for a senior frontend role with broad product ownership.</p><div className="mt-6 grid gap-3 border-t pt-5 sm:grid-cols-2"><Insight title="What they do" text="Decision support for teams working across product, research, and customer feedback." /><Insight title="Interview signal" text="Show judgment: technical depth that makes the team faster and the product clearer." /></div><div className="mt-5 flex flex-wrap gap-2" aria-label="Research sources"><Source href="https://www.atlassian.com/company" label="atlassian.com" /><Source href="https://www.atlassian.com/company/careers" label="careers" /></div></Card></section>
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><Card className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Coverage</p><h2 className="mt-1 text-lg font-semibold">4 of 4 requirements covered</h2></div><span className="inline-flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 size={17} />Complete</span></div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full w-full rounded-full bg-success" /></div><ul className="mt-5 divide-y">{requirements.map((requirement) => <li key={requirement.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="flex items-center gap-2"><Check size={15} className="text-success" />{requirement.text}</span><span className="shrink-0 font-mono text-[11px] text-muted-ink">{requirement.priority}</span></li>)}</ul><button type="button" onClick={onOpenQuestions} className="mt-4 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-signal hover:text-signal-strong">Inspect mapped questions <ArrowRight size={15} /></button></Card>
      <Card className="p-5 sm:p-6"><p className="eyebrow">Up next</p><h2 className="mt-1 text-lg font-semibold">Day 1 · 55 minutes</h2><p className="mt-3 text-sm leading-6 text-muted-ink">Role signals and React foundations. Start with the two must-have architecture questions.</p><div className="mt-6 flex items-center gap-2 text-sm"><Clock3 size={16} className="text-violet" />2 questions · 55 min</div><button type="button" onClick={onOpenSchedule} className="mt-4 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-signal hover:text-signal-strong">View study plan <ArrowRight size={15} /></button></Card></section>
  </div>;
}

function Insight({ title, text }: { title: string; text: string }) { return <div><p className="text-[13px] font-medium">{title}</p><p className="mt-1 text-sm leading-6 text-muted-ink">{text}</p></div>; }
function Source({ href, label }: { href: string; label: string }) { return <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium text-muted-ink hover:bg-surface-raised hover:text-ink">{label}<ExternalLink size={13} /></a>; }

type QuestionsViewProps = {
  category: Category; editingId: string | null; draft: { prompt: string; answer: string }; questions: Question[]; allQuestions: Question[]; savedId: string | null;
  onCategory: (category: Category) => void; onDraft: (draft: { prompt: string; answer: string }) => void; onEdit: (question: Question) => void; onCancel: () => void; onSave: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; onRegenerate: (category: Exclude<Category, "all">) => void;
};

function QuestionsView({ category, editingId, draft, questions, allQuestions, savedId, onCategory, onDraft, onEdit, onCancel, onSave, onMove, onRegenerate }: QuestionsViewProps) {
  const categories: Category[] = ["all", "technical", "behavioural", "system-design", "company-fit"];
  const selectedCategory = category === "all" ? "technical" : category;
  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Question bank</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{allQuestions.length} questions · all covered</h2></div><Button variant="secondary" size="sm" onClick={() => onRegenerate(selectedCategory)}><Sparkles size={15} />Regenerate {category === "all" ? "technical" : categoryLabels[selectedCategory]}</Button></div><div className="mt-5 flex gap-5 overflow-x-auto border-b" role="tablist" aria-label="Question categories">{categories.map((item) => { const count = item === "all" ? allQuestions.length : allQuestions.filter((question) => question.category === item).length; const active = item === category; return <button key={item} type="button" role="tab" aria-selected={active} onClick={() => onCategory(item)} className={cn("relative min-h-11 shrink-0 text-[13px] font-medium", active ? "text-ink" : "text-muted-ink hover:text-ink")}>{item === "all" ? "All" : categoryLabels[item]} <span className="ml-1 text-xs">{count}</span>{active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-signal" />}</button>; })}</div><div className="mt-5 space-y-3">{questions.map((question, index) => <QuestionCard key={question.id} question={question} index={index} total={questions.length} editing={editingId === question.id} draft={draft} saved={savedId === question.id} onDraft={onDraft} onEdit={() => onEdit(question)} onCancel={onCancel} onSave={() => onSave(question.id)} onMove={onMove} />)}</div></section>;
}

type QuestionCardProps = { question: Question; index: number; total: number; editing: boolean; draft: { prompt: string; answer: string }; saved: boolean; onDraft: (draft: { prompt: string; answer: string }) => void; onEdit: () => void; onCancel: () => void; onSave: () => void; onMove: (id: string, direction: -1 | 1) => void; };

function QuestionCard({ question, index, total, editing, draft, saved, onDraft, onEdit, onCancel, onSave, onMove }: QuestionCardProps) {
  return <Card className="p-4 sm:p-5" data-question-id={question.id}><div className="flex items-start gap-3"><GripVertical size={18} className="mt-1 shrink-0 text-muted-ink" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet/10 px-2.5 py-1 text-xs font-medium text-violet">{categoryLabels[question.category]}</span><span className="rounded-full border px-2.5 py-1 text-xs font-medium">{question.requirementIds.includes("r1") || question.requirementIds.includes("r2") || question.requirementIds.includes("r3") ? "Must-have" : "Nice to have"}</span><Difficulty difficulty={question.difficulty} /></div><div className="flex items-center gap-1"><button type="button" disabled={index === 0} onClick={() => onMove(question.id, -1)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink disabled:opacity-35" aria-label="Move question up"><ArrowUp size={16} /></button><button type="button" disabled={index === total - 1} onClick={() => onMove(question.id, 1)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink disabled:opacity-35" aria-label="Move question down"><ArrowDown size={16} /></button>{!editing && <button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-ink hover:bg-surface-raised hover:text-ink"><Pencil size={14} />Edit</button>}</div></div>{editing ? <QuestionEditor draft={draft} onDraft={onDraft} onCancel={onCancel} onSave={onSave} /> : <><h3 className="mt-4 text-[15px] font-medium leading-6">{question.prompt}</h3><div className="mt-4 border-l-2 border-violet/35 pl-3"><p className="text-xs font-medium text-muted-ink">Answer outline</p><p className="mt-1 text-sm leading-6 text-muted-ink">{question.answer}</p></div>{saved && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-success"><Check size={14} />Saved</p>}</>}</div></div></Card>;
}

function Difficulty({ difficulty }: { difficulty: 1 | 2 | 3 }) { return <span className="inline-flex items-center gap-1.5 text-xs text-muted-ink"><span className="flex gap-0.5" aria-hidden="true">{[1, 2, 3].map((level) => <i key={level} className={cn("h-1.5 w-1.5 rounded-full", level <= difficulty ? "bg-warning" : "bg-line")} />)}</span>Difficulty {difficulty}</span>; }

function QuestionEditor({ draft, onDraft, onCancel, onSave }: { draft: { prompt: string; answer: string }; onDraft: (draft: { prompt: string; answer: string }) => void; onCancel: () => void; onSave: () => void }) {
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Escape") onCancel(); if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onSave(); } }
  return <div className="mt-4 space-y-3"><label className="block"><span className="text-xs font-medium text-muted-ink">Question</span><textarea value={draft.prompt} onChange={(event) => onDraft({ ...draft, prompt: event.target.value })} onKeyDown={onKeyDown} className="mt-1.5 min-h-24 w-full rounded-xl border bg-canvas px-3 py-2.5 text-sm leading-6 outline-none focus:border-signal" /></label><label className="block"><span className="text-xs font-medium text-muted-ink">Answer outline</span><textarea value={draft.answer} onChange={(event) => onDraft({ ...draft, answer: event.target.value })} onKeyDown={onKeyDown} className="mt-1.5 min-h-24 w-full rounded-xl border bg-canvas px-3 py-2.5 text-sm leading-6 outline-none focus:border-signal" /></label><div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={onSave}><Check size={15} />Save</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button><span className="text-xs text-muted-ink">Esc to cancel · ⌘/Ctrl + Enter to save</span></div></div>;
}

function FlashcardsView({ card, index, revealed, reviewed, onReveal, onConfidence, onRestart }: { card: Flashcard; index: number; revealed: boolean; reviewed: number; onReveal: () => void; onConfidence: (value: string) => void; onRestart: () => void }) {
  return <section className="mx-auto max-w-3xl"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Practice session</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Make the outline yours.</h2></div><span className="shrink-0 text-sm text-muted-ink">{reviewed} of 12 reviewed</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-violet transition-[width] duration-200" style={{ width: `${Math.max(8, reviewed / 12 * 100)}%` }} /></div><Card className="mt-8 min-h-[26rem] p-6 sm:p-10"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-violet/10 px-2.5 py-1 text-xs font-medium text-violet">{card.requirement}</span><span className="font-mono text-xs text-muted-ink">{index + 1} / {flashcards.length}</span></div><h3 className="editorial-title mt-10 text-[clamp(2rem,5vw,3rem)] leading-[1.04]">{card.front}</h3>{revealed ? <div className="mt-9 border-t pt-6"><p className="text-xs font-medium text-muted-ink">Suggested answer</p><p className="mt-2 text-[15px] leading-7">{card.back}</p><div className="mt-8 grid gap-2 sm:grid-cols-3"><Button variant="secondary" onClick={() => onConfidence("1")}>1 · Not yet</Button><Button variant="secondary" onClick={() => onConfidence("2")}>2 · Getting there</Button><Button onClick={() => onConfidence("3")}>3 · Confident</Button></div><p className="mt-3 text-center text-xs text-muted-ink">Use 1, 2, or 3 after revealing.</p></div> : <div className="mt-10"><p className="text-sm text-muted-ink">Take a moment before you reveal the answer.</p><Button className="mt-6" onClick={onReveal}>Reveal answer <ArrowRight size={16} /></Button><p className="mt-3 text-xs text-muted-ink">Space to reveal</p></div>}</Card><button type="button" onClick={onRestart} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-ink hover:text-ink"><RotateCcw size={16} />Restart this session</button></section>;
}

function ScheduleView({ expandedDay, onToggle, questions }: { expandedDay: number; onToggle: (day: number) => void; questions: Question[] }) {
  return <section><div><p className="eyebrow">Study plan</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Five days, with a clear next move.</h2><p className="mt-2 text-sm text-muted-ink">Each session starts with the must-have signals before the optional depth.</p></div><ol className="mt-7 space-y-3">{schedule.map((day) => { const open = expandedDay === day.day; const sessionQuestions = day.questionIds.map((id) => questions.find((question) => question.id === id)).filter((question): question is Question => Boolean(question)); return <li key={day.day} className="relative pl-12"><span className={cn("absolute left-0 top-5 grid h-8 w-8 place-items-center rounded-full text-xs font-semibold", day.day === 1 ? "bg-signal text-white" : "bg-surface text-muted-ink ring-1 ring-line")}>D{day.day}</span>{day.day < schedule.length && <span className="absolute left-4 top-12 h-[calc(100%+0.75rem)] border-l border-dashed" aria-hidden="true" />}<Card className={cn("overflow-hidden", day.day === 1 && "border-signal/40")}><button type="button" onClick={() => onToggle(open ? 0 : day.day)} className="flex min-h-16 w-full items-center justify-between gap-4 px-4 text-left sm:px-5" aria-expanded={open}><span><span className="block text-[15px] font-medium">{day.focus}</span><span className="mt-1 block text-xs text-muted-ink">{sessionQuestions.length} questions · {day.minutes} minutes</span></span>{open ? <ChevronUp size={18} className="text-muted-ink" /> : <ChevronDown size={18} className="text-muted-ink" />}</button>{open && <div className="border-t bg-canvas px-4 py-4 sm:px-5"><p className="text-xs font-medium text-muted-ink">Practice prompts</p><ul className="mt-3 space-y-2">{sessionQuestions.map((question) => <li key={question.id} className="flex gap-2 text-sm leading-6"><CircleHelp size={15} className="mt-1 shrink-0 text-violet" />{question.prompt}</li>)}</ul></div>}</Card></li>; })}</ol></section>;
}

function RegenerationDialog({ category, editedCount, replaceCount, onCancel, onConfirm }: { category: Exclude<Category, "all">; editedCount: number; replaceCount: number; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-4 sm:place-items-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="regenerate-title" className="w-full max-w-md rounded-sheet border bg-surface p-5 shadow-ambient sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Scoped regeneration</p><h2 id="regenerate-title" className="mt-1 text-lg font-semibold">Refresh {categoryLabels[category]} questions?</h2></div><button type="button" onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink" aria-label="Close confirmation"><X size={17} /></button></div><p className="mt-4 text-sm leading-6 text-muted-ink">{replaceCount} generated {replaceCount === 1 ? "question will" : "questions will"} be replaced with a new researched set. {editedCount > 0 ? `Your ${editedCount} edited ${editedCount === 1 ? "question will" : "questions will"} stay exactly as written.` : "You have no edited questions in this category to preserve."}</p><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Keep current questions</Button><Button onClick={onConfirm}><Sparkles size={15} />Refresh {categoryLabels[category]}</Button></div></section></div>;
}
