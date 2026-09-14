"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { api, apiErrorMessage, CruxerApiError, pollGenerationRun, type GenerationRun, type KitDocument, type KitQuestion, type QuestionCategory } from "@/lib/api";
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

type Flashcard = { id: string; front: string; back: string; requirement: string; requirementIds: string[] };
type StudyDay = { day: number; focus: string; questionIds: string[]; minutes: number };

function studyPlan(scheduleDays?: Array<{ day: number; focus: string; question_ids: string[]; minutes: number }>): StudyDay[] {
  return scheduleDays?.map((day) => ({ ...day, questionIds: day.question_ids })) ?? [];
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

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

export function KitBuilder({ kitId }: { kitId: string }) {
  const searchParams = useSearchParams();
  const root = useRef<HTMLDivElement>(null);
  const canAnimate = useRef(false);
  const { contextSafe } = useGSAP({ scope: root });
  const [view, setView] = useState<View>(() => searchParams.get("view") === "flashcards" ? "flashcards" : "overview");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [kitDocument, setKitDocument] = useState<KitDocument | null>(null);
  const [generationRun, setGenerationRun] = useState<GenerationRun | null>(null);
  const kitRef = useRef<KitDocument | null>(null);
  const [loadingKit, setLoadingKit] = useState(true);
  const [category, setCategory] = useState<Category>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ prompt: "", answer: "", category: "technical" as Question["category"] });
  const [savedId, setSavedId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<Exclude<Category, "all"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState({ prompt: "", answer: "", category: "technical" as Question["category"] });
  const [revealed, setRevealed] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionConfidence, setSessionConfidence] = useState({ low: 0, medium: 0, high: 0 });
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
  const activeFlashcard = cards[flashcardIndex];
  const plan = useMemo(() => studyPlan(kitDocument?.kit?.schedule.days), [kitDocument?.kit?.schedule.days]);

  function applyRemote(next: KitDocument) {
    kitRef.current = next;
    setKitDocument(next);
    if (!next.kit) return;
    const editor = next.editor?.questions ?? {};
    setQuestions(next.kit.questions.map((question) => ({
      id: question.id,
      category: question.category,
      prompt: question.prompt,
      answer: question.answer_outline,
      requirementIds: question.requirement_ids,
      difficulty: question.difficulty,
      edited: Boolean(editor[question.id]?.edited || editor[question.id]?.manual || editor[question.id]?.pinned)
    })));
    const requirementsById = new Map(next.kit.role.requirements.map((requirement) => [requirement.id, requirement.text]));
    setCards(next.kit.flashcards.map((card) => ({ ...card, requirementIds: card.requirement_ids, requirement: card.requirement_ids.map((id) => requirementsById.get(id)).filter(Boolean).join(" · ") || "Role signal" })));
  }

  function restartFlashcardSession(message?: string) {
    setFlashcardIndex(0);
    setSessionReviewed(0);
    setSessionComplete(false);
    setSessionConfidence({ low: 0, medium: 0, high: 0 });
    setRevealed(false);
    if (message) setNotice(message);
  }

  useEffect(() => {
    let alive = true;
    void api.getKit(kitId).then(({ kit }) => {
      if (!alive) return;
      applyRemote(kit);
      if (kit.generationRunId) {
        void api.getGenerationRun(kit.generationRunId).then(({ generationRun: nextRun }) => {
          if (alive) setGenerationRun(nextRun);
        }).catch(() => {
          // A missing status record must not prevent the kit error state from rendering.
        });
      }
    }).catch((cause) => {
      if (alive) setNotice(apiErrorMessage(cause));
    }).finally(() => { if (alive) setLoadingKit(false); });
    return () => { alive = false; };
  // The route id is stable for a mounted builder; do not refetch after every local save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitId]);

  useEffect(() => {
    if (view !== "flashcards" || sessionComplete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a")) return;
      if (event.code === "Space") { event.preventDefault(); setRevealed((value) => !value); }
      if (revealed && ["1", "2", "3"].includes(event.key)) { event.preventDefault(); recordConfidence(event.key); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, sessionComplete, view]);

  const animateReorder = contextSafe((questionId: string, direction: number) => {
    if (!canAnimate.current) return;
    const card = root.current?.querySelector<HTMLElement>(`[data-question-id="${questionId}"]`);
    if (!card) return;
    gsap.fromTo(card, { autoAlpha: 0.72, y: direction * -8 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out", clearProps: "transform,opacity,visibility" });
  });

  function startEditing(question: Question) {
    setEditingId(question.id);
    setDraft({ prompt: question.prompt, answer: question.answer, category: question.category });
  }

  function cancelEditing() {
    setEditingId(null);
    setDraft({ prompt: "", answer: "", category: "technical" });
  }

  async function saveQuestion(questionId: string) {
    const current = questions.find((question) => question.id === questionId);
    if (!current) return;
    const next = { ...current, prompt: draft.prompt.trim() || current.prompt, answer: draft.answer.trim() || current.answer, category: draft.category, edited: true };
    const previous = questions;
    setQuestions((items) => items.map((question) => question.id === questionId ? next : question));
    setEditingId(null);
    setSavedId(questionId);
    setPendingAction(questionId);
    try {
      const document = kitRef.current;
      if (!document?.kit) throw new CruxerApiError("The saved kit is not available yet.", 0, "KIT_UNAVAILABLE");
      const { kit } = await api.updateQuestion(kitId, questionId, document.revision, { prompt: next.prompt, answer_outline: next.answer, category: next.category });
      applyRemote(kit);
      setNotice("Question saved.");
    } catch (cause) {
      handleSaveFailure(cause, previous, "Could not save that question");
    } finally { setPendingAction(null); }
    window.setTimeout(() => setSavedId((current) => current === questionId ? null : current), 1800);
  }

  async function moveQuestion(questionId: string, direction: -1 | 1) {
    const visibleIndex = visibleQuestions.findIndex((question) => question.id === questionId);
    const swapWith = visibleQuestions[visibleIndex + direction];
    if (!swapWith) return;
    const previous = questions;
    const next = [...questions];
    const sourceIndex = next.findIndex((question) => question.id === questionId);
    const targetIndex = next.findIndex((question) => question.id === swapWith.id);
    [next[sourceIndex], next[targetIndex]] = [next[targetIndex]!, next[sourceIndex]!];
    setQuestions(next);
    animateReorder(questionId, direction);
    setPendingAction("reorder");
    try {
      const document = kitRef.current;
      if (!document?.kit) throw new CruxerApiError("The saved kit is not available yet.", 0, "KIT_UNAVAILABLE");
      const { kit } = await api.reorderQuestions(kitId, document.revision, next.map((question) => question.id));
      applyRemote(kit);
      setNotice(`Moved question ${direction < 0 ? "up" : "down"}.`);
    } catch (cause) {
      handleSaveFailure(cause, previous, "Could not reorder questions");
    } finally { setPendingAction(null); }
    /*
    setQuestions((current) => {
      const sourceIndex = current.findIndex((question) => question.id === questionId);
      const targetIndex = current.findIndex((question) => question.id === swapWith.id);
      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex]!, next[sourceIndex]!];
      return next;
    });
    animateReorder(questionId, direction);
    setNotice(`Moved question ${direction < 0 ? "up" : "down"}.`);
    */
  }

  async function confirmRegeneration() {
    if (!regenerating) return;
    const changedCategory = regenerating;
    setPendingAction("regenerate");
    try {
      const document = kitRef.current;
      if (!document?.kit) throw new CruxerApiError("The saved kit is not available yet.", 0, "KIT_UNAVAILABLE");
      const response = await api.regenerate(kitId, document.revision, "questions", changedCategory);
      if (response.kit) applyRemote(response.kit);
      setRegenerating(null);
      setNotice(response.generationRun ? `${categoryLabels[changedCategory]} regeneration started. Edited and pinned questions will be preserved.` : `${categoryLabels[changedCategory]} questions refreshed. Your edited questions stayed in place.`);
    } catch (cause) {
      setNotice(`${apiErrorMessage(cause)} Your questions have not been changed.`);
    } finally { setPendingAction(null); }
  }

  async function regenerateFlashcards() {
    setPendingAction("regenerate-flashcards");
    try {
      const document = kitRef.current;
      if (!document?.kit) throw new CruxerApiError("The saved kit is not available yet.", 0, "KIT_UNAVAILABLE");
      const response = await api.regenerate(kitId, document.revision, "flashcards");
      if (response.generationRun) {
        const result = await pollGenerationRun(response.generationRun.id, { onUpdate: setGenerationRun });
        if (result.status !== "ready") { setNotice(result.terminalError?.message ?? "Flashcard refresh could not be completed."); return; }
        const { kit } = await api.getKit(kitId);
        applyRemote(kit);
        restartFlashcardSession("Flashcards refreshed. Your new session is ready.");
        return;
      }
      if (!response.kit) throw new CruxerApiError("Cruxer did not start the flashcard refresh.", 0, "GENERATION_UNAVAILABLE");
      applyRemote(response.kit);
      restartFlashcardSession("Flashcards refreshed. Your new session is ready.");
    } catch (cause) { setNotice(`Could not refresh flashcards. ${apiErrorMessage(cause)}`); } finally { setPendingAction(null); }
  }

  async function recordConfidence(value: string) {
    if (!activeFlashcard) {
      setNotice("There are no flashcards in this kit yet.");
      return;
    }
    const label = value === "1" ? "Not yet" : value === "2" ? "Getting there" : "Confident";
    const isLastCard = flashcardIndex >= cards.length - 1;
    setSessionReviewed((current) => Math.min(cards.length, current + 1));
    setSessionConfidence((current) => value === "1" ? { ...current, low: current.low + 1 } : value === "2" ? { ...current, medium: current.medium + 1 } : { ...current, high: current.high + 1 });
    setRevealed(false);
    if (isLastCard) setSessionComplete(true);
    else setFlashcardIndex((current) => current + 1);
    try {
      if (!kitRef.current?.kit) throw new CruxerApiError("The saved kit is not available yet.", 0, "KIT_UNAVAILABLE");
      const { kit } = await api.recordPractice(kitId, activeFlashcard.id, kitRef.current.revision, Number(value) as 1 | 2 | 3, browserTimeZone());
      applyRemote(kit);
      setNotice(isLastCard ? `${label} recorded. You completed this session.` : `${label} recorded. Next card ready.`);
    } catch (cause) {
      setNotice(`${label} saved for this session. ${apiErrorMessage(cause)}`);
    }
  }

  async function retryFailedKit() {
    if (generationRun?.status !== "retryable") return;
    setPendingAction("retry-generation");
    setNotice(null);
    try {
      const { generationRun: restarted } = await api.retryGenerationRun(generationRun.id);
      const result = await pollGenerationRun(restarted.id, { onUpdate: setGenerationRun });
      if (result.status !== "ready") {
        setNotice(result.terminalError?.message ?? "Cruxer could not complete this kit.");
        return;
      }
      const { kit } = await api.getKit(kitId);
      applyRemote(kit);
      setGenerationRun(result);
    } catch (cause) {
      setNotice(apiErrorMessage(cause));
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteQuestion(questionId: string) {
    const previous = questions;
    setQuestions((items) => items.filter((question) => question.id !== questionId));
    setPendingAction(questionId);
    try {
      const document = kitRef.current;
      if (!document?.kit) throw new CruxerApiError("The saved kit is not available yet.", 0, "KIT_UNAVAILABLE");
      const { kit } = await api.deleteQuestion(kitId, questionId, document.revision);
      applyRemote(kit);
      setNotice("Question removed.");
    } catch (cause) { handleSaveFailure(cause, previous, "Could not remove that question"); } finally { setPendingAction(null); }
  }

  async function addQuestion() {
    const prompt = addDraft.prompt.trim();
    const answer = addDraft.answer.trim();
    if (!prompt || !answer) { setNotice("Add both a question and an answer outline."); return; }
    const document = kitRef.current;
    const requirements = document?.kit?.role.requirements ?? [];
    const question: Question = { id: `manual-${crypto.randomUUID()}`, prompt, answer, category: addDraft.category, requirementIds: requirements.slice(0, 1).map((requirement) => requirement.id), difficulty: 2, edited: true };
    const previous = questions;
    setQuestions((items) => [...items, question]);
    setAddingQuestion(false);
    setPendingAction("add-question");
    try {
      if (!document?.kit) throw new CruxerApiError("The saved kit is not available yet.", 0, "KIT_UNAVAILABLE");
      const payload: KitQuestion = { id: question.id, prompt, answer_outline: answer, category: question.category, requirement_ids: question.requirementIds, difficulty: question.difficulty };
      const { kit } = await api.addQuestion(kitId, document.revision, payload);
      applyRemote(kit);
      setNotice("Question added.");
    } catch (cause) { handleSaveFailure(cause, previous, "Could not add that question"); } finally { setPendingAction(null); }
  }

  function handleSaveFailure(cause: unknown, previous: Question[], action: string) {
    if (cause instanceof CruxerApiError && cause.code === "REVISION_CONFLICT") {
      void api.getKit(kitId).then(({ kit }) => applyRemote(kit)).catch(() => setQuestions(previous));
      setNotice("This kit changed elsewhere. The latest saved version has been loaded; please make your change again.");
      return;
    }
    if (cause instanceof CruxerApiError && cause.status === 0) {
      setNotice(`${action} online. Your change remains visible in this session.`);
      return;
    }
    setQuestions(previous);
    setNotice(`${action}. ${apiErrorMessage(cause)}`);
  }

  if (loadingKit) {
    return <section className="py-8" aria-busy="true" aria-label="Loading kit"><div className="h-3 w-28 animate-pulse rounded bg-line" /><div className="mt-4 h-9 w-72 max-w-full animate-pulse rounded bg-line" /><div className="mt-8 h-64 animate-pulse rounded-card border bg-surface-raised" /></section>;
  }

  if (!kitDocument?.kit) {
    return <section className="mx-auto max-w-xl py-12 text-center"><p className="eyebrow">Generation incomplete</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Your preparation kit is not ready yet.</h1><p className="mt-3 text-sm leading-6 text-muted-ink">{generationRun?.terminalError?.message ?? "Cruxer could not load the completed kit."} No sample questions or company research are shown as if they were yours.</p>{generationRun?.status === "retryable" && <Button className="mt-6" onClick={() => void retryFailedKit()} disabled={pendingAction === "retry-generation"}>{pendingAction === "retry-generation" ? "Retrying generation…" : "Retry generation"}</Button>}<Link href="/dashboard/new" className="mt-5 block text-sm font-medium text-signal hover:text-signal-strong">Create another kit</Link></section>;
  }

  return <div ref={root} className="pb-4">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div>
        <p className="eyebrow">Preparation kit</p>
        <h1 className="mt-1 text-[clamp(1.7rem,4vw,2rem)] font-semibold tracking-tight">{`${kitDocument.kit.source.company} · ${kitDocument.kit.role.title}`}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-ink"><StatusPill status={kitDocument.status === "ready" ? "ready" : kitDocument.status === "generating" ? "researching" : "partial"} /><span>Changes save automatically</span><span aria-hidden="true">·</span><span>{kitDocument.kit.schedule.days_available} days remaining</span></div>
      </div>
      <Button onClick={() => setView("flashcards")}><BookOpenCheck size={16} />Practice</Button>
    </div>

    <div className="mt-6 grid gap-8 lg:grid-cols-[11.5rem_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto border-b pb-2 lg:block lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4" aria-label="Kit sections">
        {viewItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setView(id)} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[13px] font-medium transition-colors lg:flex lg:w-full", view === id ? "bg-surface text-ink shadow-sm" : "text-muted-ink hover:bg-surface-raised hover:text-ink")} aria-current={view === id ? "page" : undefined}><Icon size={16} />{label}</button>)}
      </nav>
      <main className="min-w-0" aria-live="polite">
        {view === "overview" && <Overview onOpenQuestions={() => setView("questions")} requirements={kitDocument.kit.role.requirements} kit={kitDocument.kit} />}
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
          onDelete={setDeletingQuestionId}
          onAdd={() => setAddingQuestion(true)}
          saving={pendingAction}
          onRegenerate={setRegenerating}
        />}
        {view === "flashcards" && <FlashcardsView card={activeFlashcard} index={flashcardIndex} total={cards.length} revealed={revealed} reviewed={sessionReviewed} sessionConfidence={sessionConfidence} complete={sessionComplete} onReveal={() => setRevealed(true)} onConfidence={recordConfidence} onRestart={() => restartFlashcardSession("Practice session restarted.")} onRegenerate={regenerateFlashcards} regenerating={pendingAction === "regenerate-flashcards"} />}
        {view === "schedule" && <ScheduleView expandedDay={expandedDay} onToggle={setExpandedDay} questions={questions} plan={plan} />}
      </main>
    </div>

    {notice && <div className="fixed bottom-20 right-4 z-30 max-w-sm rounded-float border bg-surface px-4 py-3 text-sm shadow-ambient lg:bottom-6" role="status"><div className="flex items-start gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink" aria-label="Dismiss message"><X size={15} /></button></div></div>}
    {regenerating && <RegenerationDialog category={regenerating} editedCount={questions.filter((question) => question.category === regenerating && question.edited).length} replaceCount={questions.filter((question) => question.category === regenerating && !question.edited).length} onCancel={() => setRegenerating(null)} onConfirm={confirmRegeneration} />}
    {addingQuestion && <AddQuestionDialog draft={addDraft} onDraft={setAddDraft} onCancel={() => setAddingQuestion(false)} onConfirm={addQuestion} />}
    {deletingQuestionId && <DeleteQuestionDialog question={questions.find((question) => question.id === deletingQuestionId)} onCancel={() => setDeletingQuestionId(null)} onConfirm={() => { void deleteQuestion(deletingQuestionId); setDeletingQuestionId(null); }} />}
  </div>;
}

function Overview({ onOpenQuestions, requirements: liveRequirements, kit }: { onOpenQuestions: () => void; requirements: Array<{ id: string; text: string; priority: string }>; kit: NonNullable<KitDocument["kit"]> }) {
  return <div className="space-y-8">
    <section><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Company brief</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Product context, not guesswork.</h2></div></div><Card className="mt-4 p-5 sm:p-6"><p className="max-w-3xl text-[15px] leading-7">{kit.company_brief.summary}</p><div className="mt-6 grid gap-3 border-t pt-5 sm:grid-cols-2"><Insight title="What they do" text={kit.company_brief.what_they_do} /><Insight title="Interview signal" text="Use the role requirements and company brief together to make your examples specific." /></div><div className="mt-5 flex flex-wrap gap-2" aria-label="Research sources">{kit.company_brief.sources.slice(0, 3).map((href) => <Source key={href} href={href} label={new URL(href).hostname} />)}</div></Card></section>
    <section className="grid gap-4"><Card className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Coverage</p><h2 className="mt-1 text-lg font-semibold">{liveRequirements.length} requirements mapped</h2></div><span className="inline-flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 size={17} />Complete</span></div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full w-full rounded-full bg-success" /></div><ul className="mt-5 divide-y">{liveRequirements.map((requirement) => <li key={requirement.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="flex items-center gap-2"><Check size={15} className="text-success" />{requirement.text}</span><span className="shrink-0 font-mono text-[11px] text-muted-ink">{requirement.priority}</span></li>)}</ul><button type="button" onClick={onOpenQuestions} className="mt-4 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-signal hover:text-signal-strong">Inspect mapped questions <ArrowRight size={15} /></button></Card></section>
  </div>;
}

function Insight({ title, text }: { title: string; text: string }) { return <div><p className="text-[13px] font-medium">{title}</p><p className="mt-1 text-sm leading-6 text-muted-ink">{text}</p></div>; }
function Source({ href, label }: { href: string; label: string }) { return <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium text-muted-ink hover:bg-surface-raised hover:text-ink">{label}<ExternalLink size={13} /></a>; }

type QuestionsViewProps = {
  category: Category; editingId: string | null; draft: { prompt: string; answer: string; category: Question["category"] }; questions: Question[]; allQuestions: Question[]; savedId: string | null; saving: string | null;
  onCategory: (category: Category) => void; onDraft: (draft: { prompt: string; answer: string; category: Question["category"] }) => void; onEdit: (question: Question) => void; onCancel: () => void; onSave: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; onDelete: (id: string) => void; onAdd: () => void; onRegenerate: (category: Exclude<Category, "all">) => void;
};

function QuestionsView({ category, editingId, draft, questions, allQuestions, savedId, saving, onCategory, onDraft, onEdit, onCancel, onSave, onMove, onDelete, onAdd, onRegenerate }: QuestionsViewProps) {
  const categories: Category[] = ["all", "technical", "behavioural", "system-design", "company-fit"];
  const selectedCategory = category === "all" ? "technical" : category;
  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Question bank</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{allQuestions.length} questions · all covered</h2></div><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={onAdd}><Pencil size={15} />Add question</Button><Button variant="secondary" size="sm" onClick={() => onRegenerate(selectedCategory)} disabled={saving === "regenerate"}><Sparkles size={15} />{saving === "regenerate" ? "Starting…" : `Regenerate ${category === "all" ? "technical" : categoryLabels[selectedCategory]}`}</Button></div></div><div className="mt-5 flex gap-5 overflow-x-auto border-b" role="tablist" aria-label="Question categories">{categories.map((item) => { const count = item === "all" ? allQuestions.length : allQuestions.filter((question) => question.category === item).length; const active = item === category; return <button key={item} type="button" role="tab" aria-selected={active} onClick={() => onCategory(item)} className={cn("relative min-h-11 shrink-0 text-[13px] font-medium", active ? "text-ink" : "text-muted-ink hover:text-ink")}>{item === "all" ? "All" : categoryLabels[item]} <span className="ml-1 text-xs">{count}</span>{active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-signal" />}</button>; })}</div><div className="mt-5 space-y-3">{questions.map((question, index) => <QuestionCard key={question.id} question={question} index={index} total={questions.length} editing={editingId === question.id} draft={draft} saved={savedId === question.id} saving={saving === question.id || saving === "reorder"} onDraft={onDraft} onEdit={() => onEdit(question)} onCancel={onCancel} onSave={() => onSave(question.id)} onMove={onMove} onDelete={() => onDelete(question.id)} />)}</div></section>;
}

type QuestionCardProps = { question: Question; index: number; total: number; editing: boolean; draft: { prompt: string; answer: string; category: Question["category"] }; saved: boolean; saving: boolean; onDraft: (draft: { prompt: string; answer: string; category: Question["category"] }) => void; onEdit: () => void; onCancel: () => void; onSave: () => void; onMove: (id: string, direction: -1 | 1) => void; onDelete: () => void; };

function QuestionCard({ question, index, total, editing, draft, saved, saving, onDraft, onEdit, onCancel, onSave, onMove, onDelete }: QuestionCardProps) {
  return <Card className="p-4 sm:p-5" data-question-id={question.id}><div className="flex items-start gap-3"><GripVertical size={18} className="mt-1 shrink-0 text-muted-ink" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet/10 px-2.5 py-1 text-xs font-medium text-violet">{categoryLabels[question.category]}</span><span className="rounded-full border px-2.5 py-1 text-xs font-medium">{question.requirementIds.includes("r1") || question.requirementIds.includes("r2") || question.requirementIds.includes("r3") ? "Must-have" : "Nice to have"}</span><Difficulty difficulty={question.difficulty} /></div><div className="flex items-center gap-1"><button type="button" disabled={saving || index === 0} onClick={() => onMove(question.id, -1)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink disabled:opacity-35" aria-label="Move question up"><ArrowUp size={16} /></button><button type="button" disabled={saving || index === total - 1} onClick={() => onMove(question.id, 1)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink disabled:opacity-35" aria-label="Move question down"><ArrowDown size={16} /></button>{!editing && <button type="button" disabled={saving} onClick={onEdit} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-ink hover:bg-surface-raised hover:text-ink disabled:opacity-35"><Pencil size={14} />Edit</button>} {!editing && <button type="button" disabled={saving} onClick={onDelete} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-danger hover:bg-danger/5 disabled:opacity-35">Delete</button>}</div></div>{editing ? <QuestionEditor draft={draft} onDraft={onDraft} onCancel={onCancel} onSave={onSave} /> : <><h3 className="mt-4 text-[15px] font-medium leading-6">{question.prompt}</h3><div className="mt-4 border-l-2 border-violet/35 pl-3"><p className="text-xs font-medium text-muted-ink">Answer outline</p><p className="mt-1 text-sm leading-6 text-muted-ink">{question.answer}</p></div>{saved && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-success"><Check size={14} />Saved</p>}</>}</div></div></Card>;
}

function Difficulty({ difficulty }: { difficulty: 1 | 2 | 3 }) { return <span className="inline-flex items-center gap-1.5 text-xs text-muted-ink"><span className="flex gap-0.5" aria-hidden="true">{[1, 2, 3].map((level) => <i key={level} className={cn("h-1.5 w-1.5 rounded-full", level <= difficulty ? "bg-warning" : "bg-line")} />)}</span>Difficulty {difficulty}</span>; }

function QuestionEditor({ draft, onDraft, onCancel, onSave }: { draft: { prompt: string; answer: string; category: Question["category"] }; onDraft: (draft: { prompt: string; answer: string; category: Question["category"] }) => void; onCancel: () => void; onSave: () => void }) {
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Escape") onCancel(); if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onSave(); } }
  return <div className="mt-4 space-y-3"><label className="block"><span className="text-xs font-medium text-muted-ink">Question</span><textarea value={draft.prompt} onChange={(event) => onDraft({ ...draft, prompt: event.target.value })} onKeyDown={onKeyDown} className="mt-1.5 min-h-24 w-full rounded-xl border bg-canvas px-3 py-2.5 text-sm leading-6 outline-none focus:border-signal" /></label><label className="block"><span className="text-xs font-medium text-muted-ink">Answer outline</span><textarea value={draft.answer} onChange={(event) => onDraft({ ...draft, answer: event.target.value })} onKeyDown={onKeyDown} className="mt-1.5 min-h-24 w-full rounded-xl border bg-canvas px-3 py-2.5 text-sm leading-6 outline-none focus:border-signal" /></label><label className="block"><span className="text-xs font-medium text-muted-ink">Category</span><select value={draft.category} onChange={(event) => onDraft({ ...draft, category: event.target.value as Question["category"] })} className="mt-1.5 min-h-11 w-full rounded-xl border bg-canvas px-3 text-sm outline-none focus:border-signal">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={onSave}><Check size={15} />Save</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button><span className="text-xs text-muted-ink">Esc to cancel · ⌘/Ctrl + Enter to save</span></div></div>;
}

function FlashcardsView({ card, index, total, revealed, reviewed, sessionConfidence, complete, onReveal, onConfidence, onRestart, onRegenerate, regenerating }: { card?: Flashcard; index: number; total: number; revealed: boolean; reviewed: number; sessionConfidence: { low: number; medium: number; high: number }; complete: boolean; onReveal: () => void; onConfidence: (value: string) => void; onRestart: () => void; onRegenerate: () => void; regenerating: boolean }) {
  if (!card) return <section className="mx-auto max-w-3xl py-10 text-center"><p className="eyebrow">Practice session</p><h2 className="mt-2 text-xl font-semibold tracking-tight">No flashcards are available yet.</h2><p className="mt-3 text-sm leading-6 text-muted-ink">Regenerate this kit after adding a fuller job description to create study prompts.</p></section>;
  const completedCount = Math.min(reviewed, total);
  const sessionScore = total === 0 ? 0 : Math.round((sessionConfidence.medium * 50 + sessionConfidence.high * 100) / total);
  return <section className="mx-auto max-w-3xl"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Practice session</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Make the outline yours.</h2></div><div className="flex items-center gap-3"><span className="shrink-0 text-sm text-muted-ink">{completedCount} of {total} reviewed</span><Button size="sm" variant="secondary" onClick={onRegenerate} disabled={regenerating}>{regenerating ? "Refreshing…" : "Refresh flashcards"}</Button></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-violet transition-[width] duration-200" style={{ width: `${completedCount / Math.max(total, 1) * 100}%` }} /></div>{complete ? <Card className="mt-8 grid min-h-[26rem] place-items-center p-6 text-center sm:p-10"><div className="max-w-md"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/10 text-success"><CheckCircle2 size={24} /></span><p className="mt-6 text-xs font-medium uppercase tracking-[0.16em] text-muted-ink">Session complete</p><h3 className="editorial-title mt-3 text-[clamp(2rem,5vw,3rem)] leading-[1.04]">Your recall score: {sessionScore}%</h3><p className="mt-4 text-sm leading-6 text-muted-ink">Based on this pass: {sessionConfidence.high} confident, {sessionConfidence.medium} getting there, and {sessionConfidence.low} to revisit. Your latest rating for each card is saved to the dashboard.</p><Button className="mt-8" onClick={onRestart}><RotateCcw size={16} />Start it over</Button></div></Card> : <><Card className="mt-8 min-h-[26rem] p-6 sm:p-10"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-violet/10 px-2.5 py-1 text-xs font-medium text-violet">{card.requirement}</span><span className="font-mono text-xs text-muted-ink">{index + 1} / {total}</span></div><h3 className="editorial-title mt-10 text-[clamp(2rem,5vw,3rem)] leading-[1.04]">{card.front}</h3>{revealed ? <div className="mt-9 border-t pt-6"><p className="text-xs font-medium text-muted-ink">Suggested answer</p><p className="mt-2 text-[15px] leading-7">{card.back}</p><div className="mt-8 grid gap-2 sm:grid-cols-3"><Button variant="secondary" onClick={() => onConfidence("1")}>1 · Not yet</Button><Button variant="secondary" onClick={() => onConfidence("2")}>2 · Getting there</Button><Button variant="secondary" className="hover:border-signal hover:bg-signal hover:text-white" onClick={() => onConfidence("3")}>3 · Confident</Button></div><p className="mt-3 text-center text-xs text-muted-ink">Not yet = 0 · Getting there = 50 · Confident = 100</p></div> : <div className="mt-10"><p className="text-sm text-muted-ink">Take a moment before you reveal the answer.</p><Button className="mt-6" onClick={onReveal}>Reveal answer <ArrowRight size={16} /></Button><p className="mt-3 text-xs text-muted-ink">Space to reveal</p></div>}</Card><button type="button" onClick={onRestart} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-ink hover:text-ink"><RotateCcw size={16} />Restart this session</button></>}</section>;
}

function ScheduleView({ expandedDay, onToggle, questions, plan }: { expandedDay: number; onToggle: (day: number) => void; questions: Question[]; plan: StudyDay[] }) {
  return <section><div><p className="eyebrow">Study plan</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{plan.length} days, with a clear next move.</h2><p className="mt-2 text-sm text-muted-ink">Each session starts with the must-have signals before the optional depth.</p></div><ol className="mt-7 space-y-3">{plan.map((day) => { const open = expandedDay === day.day; const sessionQuestions = day.questionIds.map((id) => questions.find((question) => question.id === id)).filter((question): question is Question => Boolean(question)); return <li key={day.day} className="relative pl-12"><span className={cn("absolute left-0 top-5 grid h-8 w-8 place-items-center rounded-full text-xs font-semibold", day.day === 1 ? "bg-signal text-white" : "bg-surface text-muted-ink ring-1 ring-line")}>D{day.day}</span>{day.day < plan.length && <span className="absolute left-4 top-12 h-[calc(100%+0.75rem)] border-l border-dashed" aria-hidden="true" />}<Card className={cn("overflow-hidden", day.day === 1 && "border-signal/40")}><button type="button" onClick={() => onToggle(open ? 0 : day.day)} className="flex min-h-16 w-full items-center justify-between gap-4 px-4 text-left sm:px-5" aria-expanded={open}><span><span className="block text-[15px] font-medium">{day.focus}</span><span className="mt-1 block text-xs text-muted-ink">{sessionQuestions.length} questions · {day.minutes} minutes</span></span>{open ? <ChevronUp size={18} className="text-muted-ink" /> : <ChevronDown size={18} className="text-muted-ink" />}</button>{open && <div className="border-t bg-canvas px-4 py-4 sm:px-5"><p className="text-xs font-medium text-muted-ink">Practice prompts</p><ul className="mt-3 space-y-2">{sessionQuestions.map((question) => <li key={question.id} className="flex gap-2 text-sm leading-6"><CircleHelp size={15} className="mt-1 shrink-0 text-violet" />{question.prompt}</li>)}</ul></div>}</Card></li>; })}</ol></section>;
}

function RegenerationDialog({ category, editedCount, replaceCount, onCancel, onConfirm }: { category: Exclude<Category, "all">; editedCount: number; replaceCount: number; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-4 sm:place-items-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="regenerate-title" className="w-full max-w-md rounded-sheet border bg-surface p-5 shadow-ambient sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Scoped regeneration</p><h2 id="regenerate-title" className="mt-1 text-lg font-semibold">Refresh {categoryLabels[category]} questions?</h2></div><button type="button" onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink" aria-label="Close confirmation"><X size={17} /></button></div><p className="mt-4 text-sm leading-6 text-muted-ink">{replaceCount} generated {replaceCount === 1 ? "question will" : "questions will"} be replaced with a new researched set. {editedCount > 0 ? `Your ${editedCount} edited ${editedCount === 1 ? "question will" : "questions will"} stay exactly as written.` : "You have no edited questions in this category to preserve."}</p><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Keep current questions</Button><Button onClick={onConfirm}><Sparkles size={15} />Refresh {categoryLabels[category]}</Button></div></section></div>;
}

function AddQuestionDialog({ draft, onDraft, onCancel, onConfirm }: { draft: { prompt: string; answer: string; category: Question["category"] }; onDraft: (next: { prompt: string; answer: string; category: Question["category"] }) => void; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-4 sm:place-items-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="add-question-title" className="w-full max-w-lg rounded-sheet border bg-surface p-5 shadow-ambient sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Manual question</p><h2 id="add-question-title" className="mt-1 text-lg font-semibold">Add a question</h2></div><button type="button" onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink" aria-label="Close add question"><X size={17} /></button></div><div className="mt-5 space-y-3"><label className="block"><span className="text-xs font-medium text-muted-ink">Question</span><textarea autoFocus value={draft.prompt} onChange={(event) => onDraft({ ...draft, prompt: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border bg-canvas px-3 py-2.5 text-sm leading-6 outline-none focus:border-signal" /></label><label className="block"><span className="text-xs font-medium text-muted-ink">Answer outline</span><textarea value={draft.answer} onChange={(event) => onDraft({ ...draft, answer: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border bg-canvas px-3 py-2.5 text-sm leading-6 outline-none focus:border-signal" /></label><label className="block"><span className="text-xs font-medium text-muted-ink">Category</span><select value={draft.category} onChange={(event) => onDraft({ ...draft, category: event.target.value as Question["category"] })} className="mt-1.5 min-h-11 w-full rounded-xl border bg-canvas px-3 text-sm outline-none focus:border-signal">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button onClick={onConfirm}><Check size={15} />Add question</Button></div></section></div>;
}

function DeleteQuestionDialog({ question, onCancel, onConfirm }: { question?: Question; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-4 sm:place-items-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="delete-question-title" className="w-full max-w-md rounded-sheet border bg-surface p-5 shadow-ambient sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Remove question</p><h2 id="delete-question-title" className="mt-1 text-lg font-semibold">Delete this question?</h2></div><button type="button" onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-lg text-muted-ink hover:bg-surface-raised hover:text-ink" aria-label="Close delete confirmation"><X size={17} /></button></div><p className="mt-4 text-sm leading-6 text-muted-ink">{question ? `“${question.prompt}” will be removed from this kit and its study plan.` : "This question will be removed from this kit and its study plan."}</p><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Keep question</Button><Button className="bg-danger hover:bg-danger/90" onClick={onConfirm}>Delete question</Button></div></section></div>;
}
