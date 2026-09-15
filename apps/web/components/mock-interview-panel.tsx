"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { CircleAlert, LoaderCircle, MessageSquareText, Mic, MicOff, PhoneOff, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, apiErrorMessage, type MockInterviewReport, type MockInterviewSession, type MockInterviewTranscriptTurn } from "@/lib/api";
import { cn } from "@/lib/utils";

type RuntimeState = "idle" | "requesting-mic" | "connecting" | "live" | "ending" | "waiting-scorecard" | "error";

export function MockInterviewPanel({ kitId, questionCount }: { kitId: string; questionCount: number }) {
  return <ConversationProvider><MockInterviewRuntime kitId={kitId} questionCount={questionCount} /></ConversationProvider>;
}

function MockInterviewRuntime({ kitId, questionCount }: { kitId: string; questionCount: number }) {
  const conversation = useConversation();
  const sessionRef = useRef<MockInterviewSession | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState>("idle");
  const [session, setSession] = useState<MockInterviewSession | null>(null);
  const [recentSessions, setRecentSessions] = useState<MockInterviewSession[]>([]);
  const [turns, setTurns] = useState<MockInterviewTranscriptTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  function applySession(next: MockInterviewSession) {
    sessionRef.current = next;
    setSession(next);
  }

  function loadSessions() {
    void api.getMockInterviews(kitId).then(({ sessions }) => {
      setRecentSessions(sessions);
      if (sessionRef.current && sessions[0]?.id === sessionRef.current.id && sessions[0].status === "ready") setRuntime("idle");
    }).catch(() => {
      // The empty state remains useful when the provider is not configured yet.
    });
  }

  useEffect(() => { loadSessions(); }, [kitId]);
  useEffect(() => {
    if (!recentSessions.some((item) => item.status === "ending" || item.status === "completed" || item.status === "evaluating")) return;
    const refresh = window.setInterval(loadSessions, 4_000);
    return () => window.clearInterval(refresh);
  }, [recentSessions]);
  useEffect(() => {
    if (runtime !== "live") return;
    const started = Date.now() - elapsed * 1_000;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [elapsed, runtime]);

  async function start() {
    setError(null);
    setRuntime("requesting-mic");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const started = await api.startMockInterview(kitId, Math.min(5, Math.max(1, questionCount)));
      applySession(started.session);
      setTurns([]);
      setElapsed(0);
      setRuntime("connecting");
      conversation.startSession({
        signedUrl: started.signedUrl,
        dynamicVariables: started.dynamicVariables,
        userId: started.userId,
        onConnect: ({ conversationId }) => {
          const active = sessionRef.current;
          if (!active) return;
          void api.markMockInterviewConnected(kitId, active.id, conversationId).then(({ session: next }) => {
            applySession(next);
            setRuntime("live");
            loadSessions();
          }).catch((cause) => {
            setError(apiErrorMessage(cause));
            setRuntime("error");
          });
        },
        onMessage: ({ role, message }) => {
          const text = message.trim();
          if (text) setTurns((current) => [...current, { speaker: role, text }]);
        },
        onDisconnect: () => {
          if (sessionRef.current?.status === "active") setRuntime("waiting-scorecard");
          loadSessions();
        },
        onError: (message) => {
          setError(message || "The voice connection could not continue.");
          setRuntime("error");
        }
      });
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
      setError(denied ? "Microphone access is required for a voice mock interview. Allow it in your browser, then try again." : apiErrorMessage(cause));
      setRuntime("error");
    }
  }

  async function end() {
    const active = sessionRef.current;
    setRuntime("ending");
    conversation.endSession();
    if (!active) return;
    try {
      const { session: next } = await api.endMockInterview(kitId, active.id);
      applySession(next);
      setRuntime("waiting-scorecard");
      loadSessions();
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setRuntime("error");
    }
  }

  const active = runtime === "requesting-mic" || runtime === "connecting" || runtime === "live" || runtime === "ending";
  const statusText = runtime === "requesting-mic" ? "Waiting for microphone permission" : runtime === "connecting" ? "Connecting your private interview" : runtime === "live" ? (conversation.isSpeaking ? "Interviewer is speaking" : "Listening for your answer") : runtime === "ending" ? "Finishing your interview" : runtime === "waiting-scorecard" ? "Preparing your scorecard" : "Ready when you are";

  return <section className="mx-auto max-w-4xl"><Card className="relative overflow-hidden p-5 shadow-[0_18px_54px_hsl(var(--ink)/0.08)] sm:p-8"><div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet/15 blur-3xl" aria-hidden="true" /><div className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-signal/10 blur-3xl" aria-hidden="true" /><div className="relative"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow text-violet">Voice practice</p><h2 className="mt-2 text-[clamp(1.85rem,4vw,3rem)] font-semibold tracking-[-0.05em]">Quick mock interview</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted-ink">A private interviewer will take you through up to five questions from this kit. Your transcript is assessed after the conversation ends.</p></div><span className="inline-flex items-center gap-2 rounded-full border bg-surface/70 px-3 py-1.5 text-xs font-medium text-muted-ink"><ShieldCheck size={14} className="text-success" />Private signed session</span></div>

    <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]"><div className="rounded-[1.4rem] border bg-canvas/55 p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className={cn("grid h-11 w-11 place-items-center rounded-2xl", runtime === "live" ? "bg-signal/12 text-signal" : "bg-violet/10 text-violet")}><Radio size={19} className={runtime === "live" ? "animate-pulse" : ""} /></span><div><p className="text-sm font-semibold">{statusText}</p><p className="mt-0.5 text-xs text-muted-ink">{runtime === "live" ? formatElapsed(elapsed) : `${Math.min(5, Math.max(1, questionCount))} questions · microphone required`}</p></div></div>{active && <span className="flex gap-1" aria-label="Voice activity">{[0, 1, 2, 3].map((bar) => <i key={bar} className={cn("h-5 w-1 rounded-full bg-signal", conversation.isSpeaking && "animate-pulse")} style={{ animationDelay: `${bar * 80}ms` }} />)}</span>}</div>
        <div className="mt-7 flex flex-wrap gap-3">{active ? <><Button onClick={() => void end()} variant="secondary" disabled={runtime === "ending"}>{runtime === "ending" ? <LoaderCircle size={16} className="animate-spin" /> : <PhoneOff size={16} />}{runtime === "ending" ? "Ending…" : "End interview"}</Button><Button variant="ghost" onClick={() => conversation.setMuted(!conversation.isMuted)}>{conversation.isMuted ? <MicOff size={16} /> : <Mic size={16} />}{conversation.isMuted ? "Unmute" : "Mute"}</Button></> : runtime === "waiting-scorecard" ? <Button variant="secondary" disabled><LoaderCircle size={16} className="animate-spin" />Waiting for scorecard…</Button> : <Button onClick={() => void start()}>{runtime === "error" ? <CircleAlert size={16} /> : <Mic size={16} />}{runtime === "error" ? "Try again" : "Start voice interview"}</Button>}</div>
        {error && <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 p-3 text-sm leading-6 text-danger"><CircleAlert size={16} className="mt-0.5 shrink-0" />{error}</p>}</div>
      <aside className="rounded-[1.4rem] border bg-violet/5 p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet">How it works</p><ol className="mt-4 space-y-3 text-sm leading-6 text-muted-ink"><li><b className="mr-2 text-ink">01</b>Speak through kit-specific prompts.</li><li><b className="mr-2 text-ink">02</b>End when you are ready.</li><li><b className="mr-2 text-ink">03</b>Receive a structured scorecard.</li></ol></aside></div>

    <Transcript turns={turns} live={runtime === "live"} />
    {recentSessions[0]?.status === "ready" && recentSessions[0].report && <Scorecard report={recentSessions[0].report} />}
    <SessionHistory sessions={recentSessions} />
  </div></Card></section>;
}

function Transcript({ turns, live }: { turns: MockInterviewTranscriptTurn[]; live: boolean }) {
  return <div className="relative mt-5 rounded-[1.4rem] border bg-surface/60 p-5 sm:p-6"><div className="flex items-center gap-2"><MessageSquareText size={16} className="text-violet" /><p className="text-sm font-semibold">Live transcript</p></div>{turns.length === 0 ? <p className="mt-4 text-sm leading-6 text-muted-ink">{live ? "The transcript will appear as you speak." : "Start a mock interview to see the conversation here."}</p> : <div className="mt-5 max-h-72 space-y-3 overflow-y-auto pr-1">{turns.map((turn, index) => <motion.div key={`${turn.speaker}-${index}-${turn.text.slice(0, 24)}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-xl px-3.5 py-3 text-sm leading-6", turn.speaker === "agent" ? "mr-8 bg-violet/8 text-ink" : "ml-8 bg-signal/8 text-ink")}><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-ink">{turn.speaker === "agent" ? "Interviewer" : "You"}</p>{turn.text}</motion.div>)}</div>}</div>;
}

function SessionHistory({ sessions }: { sessions: MockInterviewSession[] }) {
  if (sessions.length === 0) return null;
  return <div className="relative mt-5 border-t pt-5"><div className="flex items-center gap-2"><Sparkles size={15} className="text-signal" /><p className="text-sm font-semibold">Recent mock interviews</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{sessions.slice(0, 4).map((session) => <div key={session.id} className="rounded-xl border bg-canvas/40 px-3.5 py-3"><p className="text-sm font-medium">{statusLabel(session.status)}</p><p className="mt-1 text-xs text-muted-ink">{session.selectedQuestionIds.length} questions · {new Date(session.createdAt).toLocaleDateString()}</p>{session.failure && <p className="mt-2 text-xs leading-5 text-danger">{session.failure.message}</p>}</div>)}</div></div>;
}

function Scorecard({ report }: { report: MockInterviewReport }) {
  const dimensions = [["Relevance", report.dimensions.relevance], ["Structure", report.dimensions.structure], ["Evidence", report.dimensions.evidence], ["Clarity", report.dimensions.clarity]] as const;
  return <div className="relative mt-5 overflow-hidden rounded-[1.4rem] border border-signal/25 bg-signal/5 p-5 sm:p-6"><div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-signal/15 blur-3xl" aria-hidden="true" /><div className="relative flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-signal">Latest scorecard</p><h3 className="mt-1 text-xl font-semibold tracking-tight">What to carry into the next round</h3></div><span className="grid h-16 w-16 place-items-center rounded-2xl bg-signal text-xl font-semibold text-white shadow-[0_10px_24px_hsl(var(--signal)/0.25)]">{report.overallScore}</span></div><p className="relative mt-4 max-w-3xl text-sm leading-6 text-muted-ink">{report.summary}</p><div className="relative mt-6 grid gap-3 sm:grid-cols-4">{dimensions.map(([label, score]) => <div key={label} className="rounded-xl border bg-surface/70 p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-ink">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight">{score}</p><div className="mt-2 h-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-signal" style={{ width: `${score}%` }} /></div></div>)}</div><div className="relative mt-6 grid gap-5 border-t pt-5 md:grid-cols-3"><ReportList title="Strengths" items={report.strengths} /><ReportList title="Work on" items={report.gaps} /><ReportList title="Next session" items={report.nextSteps} /></div></div>;
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-ink">{title}</p><ul className="mt-3 space-y-2 text-sm leading-6 text-ink">{items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />{item}</li>)}</ul></div>;
}

function statusLabel(status: MockInterviewSession["status"]) {
  if (status === "ready") return "Scorecard ready";
  if (status === "evaluating" || status === "completed" || status === "ending") return "Preparing your scorecard";
  if (status === "active") return "Interview in progress";
  if (status === "failed") return "Scorecard unavailable";
  return "Ready to start";
}

function formatElapsed(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
