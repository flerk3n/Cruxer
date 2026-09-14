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

export type User = { id: string; email: string; createdAt: string };
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

export const api = {
  register: (input: { email: string; password: string }) => request<AuthResponse>("/auth/register", json(input)),
  login: (input: { email: string; password: string }) => request<AuthResponse>("/auth/login", json(input)),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  session: () => request<AuthResponse>("/auth/session"),
  listKits: () => request<{ kits: KitSummary[] }>("/kits"),
  /** Creates the lightweight draft that the generation coordinator will populate. */
  createKit: (input: CreateKitInput) => request<{ kit: { id: string } }>("/kits", json(input)),
  startGeneration: (kitId: string) => request<{ generationRun: Pick<GenerationRun, "id" | "kitId"> }>(`/kits/${encodeURIComponent(kitId)}/generate`, { method: "POST" }),
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
