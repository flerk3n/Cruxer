import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => ({
  Kit: {
    create: vi.fn(),
    exists: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn()
  },
  GenerationRun: {
    create: vi.fn(),
    deleteOne: vi.fn(),
    exists: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn()
  },
  User: { create: vi.fn(), exists: vi.fn(), findById: vi.fn(), findOne: vi.fn() },
  PracticeProgress: { deleteMany: vi.fn(), find: vi.fn(), findOneAndUpdate: vi.fn() },
  StudyActivity: { find: vi.fn(), findOneAndUpdate: vi.fn() }
}));

vi.mock("./db/models/kit.js", () => ({ Kit: models.Kit }));
vi.mock("./db/models/generation-run.js", () => ({ GenerationRun: models.GenerationRun }));
vi.mock("./db/models/user.js", () => ({ User: models.User }));
vi.mock("./db/models/practice-progress.js", () => ({ PracticeProgress: models.PracticeProgress }));
vi.mock("./db/models/study-activity.js", () => ({ StudyActivity: models.StudyActivity }));

import { createApp } from "./app.js";
import { issueSession } from "./lib/session.js";
import type { AppConfig } from "./config/env.js";

const OWNER_ID = "507f1f77bcf86cd799439011";
const OTHER_USER_ID = "507f1f77bcf86cd799439012";
const KIT_ID = "507f1f77bcf86cd799439013";
const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 4000,
  MONGODB_URI: "mongodb://not-used-by-mocked-route-tests/cruxer",
  JWT_SECRET: "test-secret-that-is-long-enough-for-jwt-signing",
  JWT_TTL_DAYS: 7,
  BCRYPT_ROUNDS: 10,
  COOKIE_NAME: "cruxer_session",
  WEB_ORIGIN: "http://localhost:3000"
};

function query<T>(value: T) {
  const result = {
    select: vi.fn(),
    sort: vi.fn(),
    lean: vi.fn()
  };
  result.select.mockReturnValue(result);
  result.sort.mockReturnValue(result);
  result.lean.mockResolvedValue(value);
  Object.assign(result, { then: (resolve: (resolved: T) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(value).then(resolve, reject) });
  return result;
}

function fixtureKit(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-09-14T10:00:00.000Z");
  return {
    _id: { toString: () => KIT_ID },
    ownerId: OWNER_ID,
    status: "ready",
    revision: 4,
    inputHash: "fixture",
    generationInput: { jd: "Build reliable APIs", companyUrl: "https://example.com/careers", days: 7 },
    kit: {
      source: { company: "Example", company_url: "https://example.com", role: "Engineer", location: "Remote", jd_chars: 19, researched_at: now.toISOString(), pages_used: ["https://example.com"] },
      company_brief: { summary: "A company", what_they_do: "Builds software", sources: ["https://example.com"] },
      role: { title: "Engineer", seniority: "Senior", responsibilities: ["Build APIs"], requirements: [{ id: "req-api", text: "TypeScript", kind: "technical", priority: "must" }] },
      questions: [{ id: "question-1", requirement_ids: ["req-api"], category: "technical", prompt: "How would you design an API?", answer_outline: "Explain the contract.", difficulty: 2 }],
      flashcards: [{ id: "flashcard-1", front: "What is idempotency?", back: "The same request has the same effect.", requirement_ids: ["req-api"] }],
      schedule: { days_available: 7, days: Array.from({ length: 7 }, (_, index) => ({ day: index + 1, focus: "Practice", question_ids: ["question-1"], minutes: 30 })) },
      coverage: { uncovered_requirement_ids: [], passes: 1 }
    },
    editor: { questions: { "question-1": { manual: false, edited: false, pinned: false } } },
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

async function serve(app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => (server as Server).close((error) => error ? reject(error) : resolve()))
  };
}

async function request(baseUrl: string, path: string, init: RequestInit = {}) {
  const token = issueSession({ id: OWNER_ID, email: "owner@example.com" }, config);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Cookie: `${config.COOKIE_NAME}=${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });
  return { response, body: await response.json() as { error?: { code: string }; kit?: { revision: number; editor?: { questions: Record<string, { edited: boolean; pinned: boolean }> } } } };
}

describe("API authorization and builder contracts", () => {
  let baseUrl = "";
  let close: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    const started = await serve(createApp(config));
    baseUrl = started.baseUrl;
    close = started.close;
  });

  afterEach(async () => { await close?.(); });

  it("rejects a protected kit request without a session before querying persistence", async () => {
    const response = await fetch(`${baseUrl}/kits/${KIT_ID}`);
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("AUTH_REQUIRED");
    expect(models.Kit.findOne).not.toHaveBeenCalled();
  });

  it("does not rate-limit repeated authenticated session reads used by the dashboard", async () => {
    const user = { _id: { toString: () => OWNER_ID }, email: "owner@example.com", createdAt: new Date("2026-09-14T10:00:00.000Z") };
    models.User.findById.mockResolvedValue(user);

    const responses = await Promise.all(Array.from({ length: 30 }, async () => {
      const { response } = await request(baseUrl, "/auth/session");
      return response.status;
    }));

    expect(responses).toEqual(Array.from({ length: 30 }, () => 200));
  });

  it("persists the registration name and returns it to the workspace", async () => {
    const createdAt = new Date("2026-09-14T10:00:00.000Z");
    models.User.exists.mockResolvedValue(undefined);
    models.User.create.mockResolvedValue({ _id: { toString: () => OWNER_ID }, name: "Ada Lovelace", email: "ada@example.com", createdAt });

    const { response, body } = await request(baseUrl, "/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "  Ada   Lovelace ", email: "ada@example.com", password: "a-secure-password" })
    });
    const user = body as unknown as { user: { name: string } };

    expect(response.status).toBe(201);
    expect(models.User.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Ada Lovelace", email: "ada@example.com" }));
    expect(user.user.name).toBe("Ada Lovelace");
  });

  it("returns latest weighted flashcard confidence in the user-scoped dashboard", async () => {
    models.Kit.find.mockReturnValue(query([fixtureKit()]));
    models.PracticeProgress.find.mockReturnValue(query([{
      kitId: { toString: () => KIT_ID },
      flashcardId: "flashcard-1",
      lastConfidence: 2,
      confidenceScore: 50
    }]));
    models.StudyActivity.find.mockReturnValue(query([]));

    const { response, body } = await request(baseUrl, "/workspace/overview?days=7&timeZone=UTC");
    const overview = body as unknown as { overview: { reviewedCards: number; confidencePercent: number }; kits: Array<{ confidencePercent: number }> };

    expect(response.status).toBe(200);
    expect(overview.overview).toMatchObject({ reviewedCards: 1, confidencePercent: 50 });
    expect(overview.kits[0]?.confidencePercent).toBe(50);
  });

  it("scopes kit reads to the authenticated owner and does not expose another user's kit", async () => {
    models.Kit.findOne.mockReturnValue(query(undefined));

    const { response, body } = await request(baseUrl, `/kits/${KIT_ID}`);

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe("KIT_NOT_FOUND");
    expect(models.Kit.findOne).toHaveBeenCalledWith({ _id: KIT_ID, ownerId: OWNER_ID });
    expect(models.Kit.findOne).not.toHaveBeenCalledWith(expect.objectContaining({ ownerId: OTHER_USER_ID }));
  });

  it("prevents question edits while a generation lease is active", async () => {
    models.Kit.findOne.mockReturnValue(query(fixtureKit({ status: "generating" })));

    const { response, body } = await request(baseUrl, `/kits/${KIT_ID}/questions/question-1`, {
      method: "PATCH",
      body: JSON.stringify({ revision: 4, pinned: true })
    });

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("KIT_GENERATING");
    expect(models.Kit.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("reports a stale builder revision without applying a nested patch", async () => {
    models.Kit.findOne.mockReturnValue(query(fixtureKit({ revision: 5 })));

    const { response, body } = await request(baseUrl, `/kits/${KIT_ID}/questions/question-1`, {
      method: "PATCH",
      body: JSON.stringify({ revision: 4, pinned: true })
    });

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("REVISION_CONFLICT");
    expect(models.Kit.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("records a pinned manual-preservation flag alongside a validated question edit", async () => {
    const current = fixtureKit();
    const saved = fixtureKit({
      revision: 5,
      editor: { questions: { "question-1": { manual: false, edited: true, pinned: true } } }
    });
    models.Kit.findOne.mockReturnValue(query(current));
    models.Kit.findOneAndUpdate.mockResolvedValue(saved);

    const { response, body } = await request(baseUrl, `/kits/${KIT_ID}/questions/question-1`, {
      method: "PATCH",
      body: JSON.stringify({ revision: 4, prompt: "How do you version a public API?", pinned: true })
    });

    expect(response.status).toBe(200);
    expect(body.kit?.revision).toBe(5);
    expect(body.kit?.editor?.questions["question-1"]).toEqual({ manual: false, edited: true, pinned: true });
    expect(models.Kit.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: KIT_ID, ownerId: OWNER_ID, revision: 4, status: { $ne: "generating" } },
      expect.objectContaining({ $inc: { revision: 1 } }),
      expect.objectContaining({ new: true })
    );
  });

  it("refuses to start duplicate generation for a kit already marked generating", async () => {
    models.Kit.findOne.mockReturnValue(query(fixtureKit({ status: "generating" })));

    const { response, body } = await request(baseUrl, `/kits/${KIT_ID}/generate`, { method: "POST" });

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("GENERATION_IN_PROGRESS");
    expect(models.GenerationRun.create).not.toHaveBeenCalled();
  });
});
