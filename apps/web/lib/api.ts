/**
 * Browser API boundary. Keep the default relative so production traffic stays on
 * the Vercel origin (`/api` rewrite) and its first-party session cookie works.
 * Setting NEXT_PUBLIC_API_URL is useful for a direct local or preview API.
 */
const configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const apiBaseUrl = configuredBaseUrl && configuredBaseUrl !== "/"
  ? configuredBaseUrl.replace(/\/$/, "")
  : "/api";

export class CruxerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "REQUEST_FAILED",
    public readonly requestId?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CruxerApiError";
  }
}

type ApiErrorBody = {
  error?: { code?: string; message?: string; requestId?: string; details?: unknown };
};

export type User = { id: string; name: string; email: string; createdAt: string };
export type AuthResponse = { user: User };
export type KitStatus = "draft" | "generating" | "ready" | "failed";
export type KitSummary = {
  id: string;
  status: KitStatus;
  revision: number;
  generationRunId?: string;
  company: string;
  roleTitle: string;
  createdAt: string;
  updatedAt: string;
};
export type GenerationStep = {
  name: string;
  status: "pending" | "running" | "complete" | "warning" | "failed";
  message?: string;
  startedAt?: string;
  completedAt?: string;
};
export type GenerationRun = {
  id: string;
  kitId?: string;
  status: "queued" | "running" | "ready" | "failed" | "retryable";
  steps: GenerationStep[];
  warnings: Array<{ code: string; message: string; step?: string }>;
  retryCount: number;
  terminalError?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
};
export type CreateKitInput = { jd: string; companyUrl: string; days: number };
export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";
export type KitRequirement = { id: string; text: string; kind: "technical" | "behavioural" | "domain"; priority: "must" | "nice" };
export type KitQuestion = {
  id: string;
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
};
export type KitFlashcard = { id: string; front: string; back: string; requirement_ids: string[] };
export type PersistedKit = {
  source: { company: string; company_url: string; role: string; location: string; jd_chars: number; researched_at: string; pages_used: string[] };
  company_brief: { summary: string; what_they_do: string; sources: string[] };
  role: { title: string; seniority: string; responsibilities: string[]; requirements: KitRequirement[] };
  questions: KitQuestion[];
  flashcards: KitFlashcard[];
  schedule: { days_available: number; days: Array<{ day: number; focus: string; question_ids: string[]; minutes: number }> };
  coverage: { uncovered_requirement_ids: string[]; passes: number };
};
export type KitEditorState = {
  questions?: Record<string, { manual?: boolean; edited?: boolean; pinned?: boolean }>;
  flashcards?: Record<string, { manual?: boolean; edited?: boolean; pinned?: boolean }>;
};
export type KitDocument = {
  id: string;
  status: KitStatus;
  revision: number;
  generationRunId?: string;
  kit?: PersistedKit;
  editor?: KitEditorState;
  createdAt: string;
  updatedAt: string;
};
export type MockInterviewStatus = "created" | "active" | "ending" | "completed" | "evaluating" | "ready" | "failed";
export type MockInterviewTranscriptTurn = { speaker: "agent" | "user"; text: string; at?: string };
export type MockInterviewReport = {
  overallScore: number;
  dimensions: { relevance: number; structure: number; evidence: number; clarity: number };
  summary: string;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
};
export type MockInterviewSession = {
  id: string;
  kitId: string;
  selectedQuestionIds: string[];
  status: MockInterviewStatus;
  providerConversationId?: string;
  transcript: MockInterviewTranscriptTurn[];
  report?: MockInterviewReport;
  startedAt?: string;
  endedAt?: string;
  failure?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
};
/** Server-backed practice summary for one flashcard. Historical events are not fabricated. */
export type PracticeProgress = {
  flashcardId: string;
  lastConfidence?: 1 | 2 | 3;
  confidenceScore: number;
  attempts: number;
  lastReviewedAt?: string;
  updatedAt?: string;
};
export type ActivityDay = {
  date: string;
  flashcardReviews: number;
  confidence: { low: number; medium: number; high: number };
  checkedIn: boolean;
  effortUnits: number;
};
export type StudyScheduleSummary = {
  startedOn: string;
  deadline: string;
  totalDays: number;
  dayNumber: number;
  daysRemaining: number;
  status: "active" | "complete";
  focus: string;
  minutes: number;
  questionCount: number;
};
export type KitActivity = {
  timeZone: string;
  range: { from: string; to: string; days: number };
  series: ActivityDay[];
  today?: ActivityDay;
  schedule: StudyScheduleSummary | null;
};
export type WorkspaceKitProgress = {
  kitId: string;
  company: string;
  roleTitle: string;
  totalCards: number;
  reviewedCards: number;
  progressPercent: number;
  confidencePercent: number;
  questionCount: number;
};
export type WorkspaceOverview = {
  overview: { activeKits: number; totalCards: number; reviewedCards: number; totalQuestions: number; progressPercent: number; confidencePercent: number };
  kits: WorkspaceKitProgress[];
  activity: Omit<KitActivity, "schedule">;
};

function endpoint(path: string): string {
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint(path), {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...init.headers }
    });
  } catch {
    throw new CruxerApiError(
      "Cruxer could not reach the service. Check your connection and try again.",
      0,
      "NETWORK_ERROR"
    );
  }

  if (response.status === 204) return undefined as T;
  const body = await parseJson(response);
  if (!response.ok) {
    const error = body as ApiErrorBody;
    throw new CruxerApiError(
      error.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      error.error?.code ?? "REQUEST_FAILED",
      error.error?.requestId,
      error.error?.details
    );
  }
  return body as T;
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try { return await response.json(); } catch { return undefined; }
}

function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function patch(body: unknown): RequestInit {
  return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  register: (input: { name: string; email: string; password: string }) => request<AuthResponse>("/auth/register", json(input)),
  login: (input: { email: string; password: string }) => request<AuthResponse>("/auth/login", json(input)),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  session: () => request<AuthResponse>("/auth/session"),
  listKits: () => request<{ kits: KitSummary[] }>("/kits"),
  getWorkspaceOverview: (input: { days?: number; timeZone?: string } = {}) => {
    const query = new URLSearchParams();
    if (input.days) query.set("days", String(input.days));
    if (input.timeZone) query.set("timeZone", input.timeZone);
    return request<WorkspaceOverview>(`/workspace/overview${query.size ? `?${query}` : ""}`);
  },
  /** Creates the lightweight draft that the generation coordinator will populate. */
  createKit: (input: CreateKitInput) => request<{ kit: { id: string } }>("/kits", json(input)),
  getKit: (kitId: string) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}`),
  getMockInterviews: (kitId: string) => request<{ sessions: MockInterviewSession[] }>(`/kits/${encodeURIComponent(kitId)}/mock-interviews`),
  startMockInterview: (kitId: string, questionCount = 5) => request<{ session: MockInterviewSession; signedUrl: string; dynamicVariables: Record<string, string>; firstMessage: string; userId: string }>(`/kits/${encodeURIComponent(kitId)}/mock-interviews`, json({ questionCount })),
  markMockInterviewConnected: (kitId: string, sessionId: string, providerConversationId: string) => request<{ session: MockInterviewSession }>(`/kits/${encodeURIComponent(kitId)}/mock-interviews/${encodeURIComponent(sessionId)}/connected`, json({ providerConversationId })),
  endMockInterview: (kitId: string, sessionId: string) => request<{ session: MockInterviewSession }>(`/kits/${encodeURIComponent(kitId)}/mock-interviews/${encodeURIComponent(sessionId)}/end`, { method: "POST" }),
  updateCompanyBrief: (kitId: string, revision: number, changes: Partial<Pick<PersistedKit["company_brief"], "summary" | "what_they_do">>) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}/company-brief`, patch({ revision, ...changes })),
  addQuestion: (kitId: string, revision: number, question: KitQuestion) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}/questions`, json({ revision, question })),
  updateQuestion: (kitId: string, questionId: string, revision: number, changes: Partial<Omit<KitQuestion, "id">> & { pinned?: boolean }) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}/questions/${encodeURIComponent(questionId)}`, patch({ revision, ...changes })),
  deleteQuestion: (kitId: string, questionId: string, revision: number) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}/questions/${encodeURIComponent(questionId)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }) }),
  reorderQuestions: (kitId: string, revision: number, questionIds: string[]) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}/questions/reorder`, json({ revision, questionIds })),
  addFlashcard: (kitId: string, revision: number, flashcard: KitFlashcard) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}/flashcards`, json({ revision, flashcard })),
  updateFlashcard: (kitId: string, flashcardId: string, revision: number, changes: Partial<Omit<KitFlashcard, "id">> & { pinned?: boolean }) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}/flashcards/${encodeURIComponent(flashcardId)}`, patch({ revision, ...changes })),
  deleteFlashcard: (kitId: string, flashcardId: string, revision: number) => request<{ kit: KitDocument }>(`/kits/${encodeURIComponent(kitId)}/flashcards/${encodeURIComponent(flashcardId)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }) }),
  regenerate: (kitId: string, revision: number, section: "questions" | "flashcards" | "company-brief" | "schedule", category?: QuestionCategory) => request<{ kit?: KitDocument; generationRun?: Pick<GenerationRun, "id" | "kitId"> }>(`/kits/${encodeURIComponent(kitId)}/regenerate`, json({ revision, section, ...(category ? { category } : {}) })),
  recordPractice: (kitId: string, flashcardId: string, confidence: 1 | 2 | 3, timeZone?: string) => request<{ progress: PracticeProgress }>(`/kits/${encodeURIComponent(kitId)}/practice/${encodeURIComponent(flashcardId)}`, json({ confidence, ...(timeZone ? { timeZone } : {}) })),
  getPractice: (kitId: string) => request<{ progress: PracticeProgress[] }>(`/kits/${encodeURIComponent(kitId)}/practice`),
  getActivity: (kitId: string, input: { days?: number; timeZone?: string } = {}) => {
    const query = new URLSearchParams();
    if (input.days) query.set("days", String(input.days));
    if (input.timeZone) query.set("timeZone", input.timeZone);
    return request<KitActivity>(`/kits/${encodeURIComponent(kitId)}/activity${query.size ? `?${query}` : ""}`);
  },
  checkIn: (kitId: string, timeZone?: string) => request<{ activity: ActivityDay }>(`/kits/${encodeURIComponent(kitId)}/activity/check-in`, json(timeZone ? { timeZone } : {})),
  startGeneration: (kitId: string) => request<{ generationRun: Pick<GenerationRun, "id" | "kitId"> }>(`/kits/${encodeURIComponent(kitId)}/generate`, { method: "POST" }),
  retryGenerationRun: (runId: string) => request<{ generationRun: Pick<GenerationRun, "id" | "kitId"> }>(`/generation-runs/${encodeURIComponent(runId)}/retry`, { method: "POST" }),
  getGenerationRun: (runId: string) => request<{ generationRun: GenerationRun }>(`/generation-runs/${encodeURIComponent(runId)}`)
};

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof CruxerApiError && error.status === 401;
}

export function apiErrorMessage(error: unknown): string {
  return error instanceof CruxerApiError ? error.message : "Something went wrong. Please try again.";
}

export function isTerminalRun(status: GenerationRun["status"]): boolean {
  return status === "ready" || status === "failed" || status === "retryable";
}

/** Polls the persisted server run; it never fabricates percentage or completion. */
export async function pollGenerationRun(
  runId: string,
  options: {
    signal?: AbortSignal;
    intervalMs?: number;
    onUpdate: (run: GenerationRun) => void;
  }
): Promise<GenerationRun> {
  const intervalMs = options.intervalMs ?? 1_500;
  for (;;) {
    if (options.signal?.aborted) throw new DOMException("Polling stopped.", "AbortError");
    const { generationRun } = await api.getGenerationRun(runId);
    options.onUpdate(generationRun);
    if (isTerminalRun(generationRun.status)) return generationRun;
    await wait(intervalMs, options.signal);
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", abort); resolve(); }
    function abort() { window.clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new DOMException("Polling stopped.", "AbortError")); }
    if (signal) signal.addEventListener("abort", abort, { once: true });
  });
}
