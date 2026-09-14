# AI Interview Prep Kit — Delivery Plan

## 1. Scope and delivery guardrails

This plan implements the assessment specification only. The product will support authentication, single and batch kit creation, research and multi-step generation, the editable kit builder, flashcard practice, deterministic scheduling, the required batch evaluator, deployment, documentation, and the specified tests.

It will **not** add CV processing, job search, application workflows, payments, collaboration, audio/video simulation, email verification, password reset, roles, or an optional creative feature. The optional feature is deliberately excluded to protect the four-day timebox and the scored requirements.

Two interfaces are treated as fixed compatibility contracts from the first commit:

- The exact Appendix A kit fields and names, including stable requirement/question/flashcard ids.
- `npm run evaluate -- --input <cases.json> --output <kits.json>` and the Appendix B result envelope.

## 2. Chosen architecture and stack

Use a TypeScript npm-workspaces monorepo so the application and batch command share one pipeline implementation:

```text
apps/
  web/                 Next.js App Router UI
  api/                 Express HTTP API and generation coordinator
packages/
  domain/              Appendix A Zod schemas, types, ids, pure coverage/schedule logic
  pipeline/            retrieval, extraction, generation, validation orchestration
  db/                  Mongoose models and repositories
  config/              typed environment parsing
scripts/
  evaluate.ts          required CLI; calls packages/pipeline directly
```

| Concern | Decision | Reason |
| --- | --- | --- |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS, shadcn/Radix primitives, TanStack Query, dnd-kit, and targeted GSAP | Meets the required UI stack; supports responsive reusable components, accessible interactions, optimistic editing, polling, keyboard-accessible reordering, and a small number of high-value motion sequences. |
| API | Node.js, Express, TypeScript | Matches the preferred stack and keeps the long-running pipeline outside a Vercel function timeout. |
| Data | MongoDB Atlas Free cluster with Mongoose | Free persistent store that matches the brief; document models naturally fit nested kits and editable child state. |
| Validation | Zod shared by web, API, CLI, and persistence boundary | A single executable definition of Appendix A prevents schema drift. |
| LLM | Gemini 3.1 Flash-Lite via `@google/genai` structured JSON mode (`GEMINI_MODEL` override supported) | Lite is sufficient because the pipeline deliberately decomposes work into bounded extraction, brief, category, flashcard, and correction calls; it supports structured outputs and is documented for lightweight agentic/data-extraction work. Zod still validates every result because provider-conformant JSON is not semantic validation. |
| Public-interview search | Tavily Search API behind a `PublicDiscussionSearch` interface | Its current free plan advertises 1,000 monthly credits without a card. Limit each kit to two focused queries and fetch only a small ranked set of public results. |
| HTML retrieval | Native `fetch`, Cheerio, `robots-parser`, Node DNS/IP utilities | Enough for static public pages; avoids fragile/headless-browser scope. |
| Hosting | Vercel (web), Render Free Web Service (API), MongoDB Atlas Free | All are publicly reachable and usable on free tiers. Render is chosen over serverless for a process that may generate for ~90 seconds. 

The frontend will call `/api/*` on its own Vercel origin. A Vercel external rewrite forwards that path to the public Render API without changing the browser URL. This permits an httpOnly first-party session cookie (`Secure`, `SameSite=Lax` in production) instead of depending on increasingly unreliable third-party cookies. The Render API will still expose a public `/health` endpoint as required; it will allow an explicit production Vercel origin in CORS only for direct API use.

Document deployment caveats honestly: Render Free can cold-start after idle time and has ephemeral local storage, so MongoDB is the sole persistent store and the UI explains a startup delay.

## 3. Data and state design

### 3.1 Required kit representation

Implement an `AppendixAKitSchema` that requires exactly the fields from Appendix A and validates these invariants in addition to primitive types:

- `requirements[].id`, question ids, and flashcard ids are unique and stable within a kit.
- Requirement kind, priority, question category, and difficulty use only allowed values.
- Every question/flashcard requirement id and every scheduled question id resolves to an existing entity.
- `schedule.days_available` equals the requested days; it has exactly that many days; day numbers are 1..N; and every `minutes` value is an integer.
- `coverage.uncovered_requirement_ids` is computed, not trusted from a model response.

Persist the canonical Appendix A `kit` plus narrowly scoped application metadata, never by renaming or replacing Appendix fields:

- `Kit`: owner id, canonical kit, draft/generating/ready/failed status, a current generation run id, timestamps, revision, and a normalized input hash.
- `QuestionMeta` / `FlashcardMeta`: `origin: generated | manual`, `editedAt`, `pinned`, and ordering/category overrides. Editing sets `pinned=true`; manually added items start pinned.
- `GenerationRun`: named steps, per-step status/message/timing, structured warning records, retry count, and terminal error. The UI polls it for progress.
- `PracticeProgress`: per user and flashcard, last confidence (1–3), attempts, last reviewed time, and computed next-session ordering inputs.

Keep retrieval text and prompt material transient where practical. Persist only source URLs, extracted facts needed to reproduce the kit, warnings, and bounded/sanitized error diagnostics—never credentials or raw untrusted HTML.

### 3.2 Edit and regeneration rule

All single-section regeneration occurs on a server snapshot and writes only its target section in one revision-checked update. For a question-category regeneration, generated unedited questions in that category may be replaced; manual, edited, or pinned questions are retained, their ids remain stable, and they participate in the following coverage check. Regenerating the brief or schedule never touches questions, flashcards, or other edits. A `409` response triggers the client to reload/merge rather than silently overwrite a newer edit.

## 4. Generation pipeline (shared by UI and CLI)

`KitPipeline.run(caseInput, observer)` is the only full-generation entry point. HTTP starts it in a persisted generation run; `scripts/evaluate.ts` invokes the same service and supplies a CLI observer. There is no separate “batch implementation.”

### 4.1 Step sequence

1. **Validate and normalize input.** Validate JD length, URL syntax, and integer days within a documented reasonable bound (1–60). Compute an input hash for idempotency. A duplicate ready kit may be reopened; a duplicate in-flight request returns its existing run rather than starting competing work.
2. **Defend and retrieve.** Parse the URL, reject credentials and non-HTTP(S) schemes, resolve DNS, reject loopback/private/link-local/reserved addresses in deployed production, and re-check every redirect target. The evaluator/dev path permits explicit localhost fixtures only under `NODE_ENV=test`/`development`, never the deployed production service. Enforce `robots.txt`, a descriptive User-Agent, host-level rate limiting, timeouts, `Retry-After`, bounded exponential backoff with jitter, HTML/XHTML content types, and a maximum response size.
3. **Crawl and rank company links.** Fetch the allowed landing page, extract/canonicalize same-site links and follow relative links. Rank links using anchor text, URL tokens, and page titles for about/product/careers/jobs/people/handbook/interview/hiring signals; then fetch only the best bounded candidates allowed by robots. This is discovery-based—not a fixed list of paths. Clean extracted text to a bounded readable form.
4. **Find public interview discussion.** Query the `PublicDiscussionSearch` adapter with at most two company-focused queries (for example, company + interview process and company + interview experience), rank diverse public results, then safely fetch/clean the best allowed results. Search/no-result/provider errors become recorded warnings, not a failed kit.
5. **Extract role facts.** Ask the LLM for role title, seniority, responsibilities, and atomic requirements only from the pasted JD. Each requirement includes an internal exact JD evidence span; application code rejects/repairs claims without a source span. Assign deterministic `r1…` ids in source order and map stated “required/must/mandatory” language to `must`, and bonus/preferred/nice-to-have language to `nice`. A thin JD yields few or no requirements plus an honest warning, never invented requirements.
6. **Generate the company brief.** Use only marked, delimited retrieval excerpts and URL provenance. Prompt it to say “not found” when evidence is missing. It cannot treat retrieved content as instructions. Validate the brief response and attach only actual sources used.
7. **Generate questions in separate category calls.** Build distinct prompts for applicable technical, behavioural, system-design, and company-fit groups. Each prompt receives only relevant requirements/research and must return explicit requirement ids. Do not ask one prompt for the full kit. Validate ids, category, difficulty, and content before merging.
8. **Generate flashcards.** Generate flashcards against existing requirement ids from the extracted requirements/questions. Validate before merging.
9. **Deterministically calculate coverage.** Pure code computes every requirement lacking a referencing question; it does not ask the model whether coverage is sufficient.
10. **Targeted second pass.** For uncovered requirements, call the relevant category generator with only the gaps, merge validated output, then recompute coverage. Use an initial pass plus at most two targeted correction passes. If a provider repeatedly fails to supply a question for a remaining must-have, create a clearly deterministic fallback question from the original requirement text, revalidate, and record a warning—never persist a “ready” kit with an uncovered must-have.
11. **Deterministically build schedule.** Code—not the LLM—sorts must-have/greater-difficulty material first, assigns each existing question exactly once across the requested number of days, creates exactly N day objects (including focus-only days when N exceeds question count), gives every must-have at least one scheduled question, and calculates integer minutes. Re-run the final full schema and invariant validation before persistence.

### 4.2 Failure, retry, and timing policy

- Every external operation has a classified result: success, recoverable warning, or terminal failure. A bad company URL after three attempts is terminal; an absent hiring page or discussion is an `ok` kit with warnings.
- The Gemini and search adapters use a shared token/request-aware limiter, provider `Retry-After` when available, jittered exponential retries, response-size/token budgets, and finite per-step attempt limits. This protects free-tier limits and keeps five batch cases within the 15-minute constraint.
- Invalid JSON, Zod failure, or semantic invariant failure gets one corrective retry with the validation error reduced to safe field-level guidance; it is never saved blindly.
- The API returns `202` with a run id immediately. It reports persisted progress (`input`, `research`, `role`, categories, `coverage`, `schedule`, `validation`) via polling and explicit partial/failure warnings. If the process restarts, stale in-flight runs are marked retryable rather than presented as success.

## 5. API and frontend plan

### 5.1 API surface

Implement a small versioned REST surface with Zod validation, ownership middleware, structured errors (`code`, safe `message`, `requestId`), request size limits, and rate limiting:

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`.
- `GET /kits`, `POST /kits`, `GET /kits/:id`, `PATCH /kits/:id`.
- `POST /kits/:id/regenerate` (brief, category, or schedule only), `GET /generation-runs/:id`.
- Protected granular endpoints for question/flashcard add/update/delete/reorder/category move and flashcard confidence events.
- `POST /kits/batch` accepts a validated JSON upload in the documented Appendix B input shape (with a clear downloadable example), starts one persisted run per row, and reports row-level results. Supporting CSV is intentionally excluded: a single documented file format satisfies the file-upload requirement without adding ambiguous field mapping.
- `GET /health` remains public and has no sensitive details.

Passwords use bcrypt with a documented cost factor. Use short-lived signed JWT session cookies, token expiry handling, and explicit logout cookie clearing. Auth middleware verifies signature, expiry, and owner id for every protected endpoint. Apply Helmet-style headers, a production origin allow-list, and no secrets in responses/logs.

### 5.2 Pages and interaction states

- **Public:** landing/login/register routes. Protected route middleware redirects unauthenticated visitors.
- **Kit dashboard:** only the current user’s kits, clear empty state, create-kit form (JD textarea, company URL, days), and a batch file chooser with per-case feedback.
- **Generation view:** a durable stepper backed by the generation run, source/warning summary, recoverable failure messages and retry/reopen actions. Never fake percentage or hide a partial research result.
- **Kit builder:** tabs/sections for company brief, role, categorized questions, flashcards, schedule, and coverage. Inline save on blur/explicit keyboard save, local optimistic updates, accessible drag handles and up/down controls as a non-pointer alternative, category move menu, add/delete confirmation, and narrow regeneration controls.
- **Practice:** one flashcard at a time, reveal answer, confidence 1–3 input, covered/remaining progress, and next-session ordering by lowest confidence first, then least recently reviewed. This simple deterministic confidence-weighted ordering will be defended in the README.
- **Readiness runway:** derive a current study-day position from the requested schedule and recorded activity, show the exact day-by-day timeline and next action, and persist a bounded daily-effort aggregate for an accessible GitHub-style graph. The graph is an aid to choosing the next session, not an optional gamification feature or a substitute for the required practice tracking.

Use semantic elements, visible focus states, labels and live regions for generation/errors, touch-sized controls, and responsive layouts verified at phone and laptop widths.

## 6. Required evaluator, tests, and quality gate

### 6.1 Batch command

Root `package.json` exposes exactly:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

The CLI validates Appendix B input, processes cases with conservative bounded concurrency, uses each case’s supplied `days`, calls `KitPipeline`, and atomically writes one Appendix B envelope with `version`, ISO `generated_at`, and one result per input id. It continues after terminal errors; only failure to produce any kit yields `{ status: "failed", kit: null, error }`. It must work from a clean clone after the documented install and environment setup.

### 6.2 Automated checks

- Unit tests for scheduling: 1 day, 60 days, empty/thin requirements, priority/difficulty ordering, exact day count, integer minutes, valid question references, and all must-haves scheduled.
- Unit/property tests for coverage: duplicates, multiple references, gaps, correction merge, and no uncovered must-haves in a ready kit.
- Schema/invariant tests against valid Appendix A fixtures and invalid ids/enums/durations/references.
- Pipeline tests with mocked LLM/search/fetch: distinct category calls, second pass, retrieval warning continuation, invalid model JSON repair, rate-limit retry, local relative-link crawl, robots denial, and batch continues after a failed case.
- API integration tests for auth/ownership, expired sessions, revision conflict, pinned-edit preservation during regeneration, and structured errors.
- Browser smoke tests for register/login, generate progress, inline edit/reorder/regenerate preservation, and flashcard confidence ordering.
- CI runs typecheck, lint, unit/integration tests, web production build, and a fixture evaluator command. A release gate also runs five fixture cases with the same finite retry budget and checks total runtime is under 15 minutes.

## 7. Deployment and documentation

1. Create Atlas Free cluster, least-privilege database user, and network access appropriate for Render; use `MONGODB_URI` only as a server secret.
2. Deploy `apps/api` as a Render Web Service. Configure health check, Node build/start commands, `WEB_ORIGIN`, `JWT_SECRET`, `GEMINI_API_KEY`, `TAVILY_API_KEY`, `MONGODB_URI`, and explicit production mode. No secret is committed.
3. Deploy `apps/web` to Vercel. Set its server-side API origin/rewrite destination, configure the `/api/:path*` external rewrite, and test cookie behavior on the deployed URL.
4. Add `.env.example` containing every variable name, whether it is required, and a non-secret explanation. Include a local development origin/cookie configuration and evaluator setup.
5. Produce a README covering all required submission topics: architecture, stack choices, local/deployed setup, exact evaluator command, provider/model, source/retrieval behavior, sequencing, provenance/prompt-injection defenses, state preservation, schedule algorithm, retries/idempotency, security, trade-offs/known limits, deployment URLs, and test commands.
6. Make small, meaningful commits by completed phase; publish the repository, deployment links, and a 3–4 minute walkthrough that demonstrates every required scenario (especially coverage pass and preserved edits).

## 8. Four-day execution order

### Phase 0 — Contract and foundation (half day)

- Initialize the npm workspaces, TypeScript settings, lint/test tooling, env parser, shared Appendix A/Appendix B schemas, and fixtures.
- Implement pure id, coverage, schedule, and full-kit validation functions first; write their tests before LLM code.
- Add the root evaluator command skeleton and verify it reads/writes fixture JSON exactly.

**Exit criterion:** the repository installs from clean state; schema, coverage, schedule, and evaluator-envelope tests pass.

### Phase 1 — Backend identity and persistence (half day)

- Build Mongoose models/repositories, auth/session middleware, protected kit ownership, revision control, and structured error handling.
- Implement kit CRUD plus metadata that distinguishes generated/manual/edited/pinned content.

**Exit criterion:** unauthorized access is rejected; a user cannot read/mutate another user’s kit; state survives reload.

### Phase 2 — Safe retrieval and research (half day)

- Build fetch policy, robots/redirect/DNS safeguards, timeouts/backoff/rate limits, HTML cleaner, crawl/link ranker, and pluggable public-discussion search.
- Add fixture servers for relative links, absent hiring pages, blocked paths, bad content, and timeouts.

**Exit criterion:** an unreachable or thin-research case yields bounded warnings rather than a pipeline crash, while production URL protections and evaluator-local fixtures both work in their allowed modes.

### Phase 3 — Validated generation pipeline and CLI (one day)

- Implement Gemini adapter, prompt templates, requirement evidence checks, deliberately separate category calls, targeted coverage loop, deterministic fallback, flashcards, and scheduling.
- Wire the shared pipeline into the API generation coordinator and evaluator; implement run progress/status and duplicate handling.
- Test five fixture cases under the time budget.

**Exit criterion:** every ready kit validates against Appendix A, has no uncovered must-have, has exactly requested schedule days, and CLI failures do not abort later cases.

### Phase 4 — Complete usable frontend (one day)

- Build auth, dashboard/create/batch input, progress view, responsive builder, inline editing/reorder/category move, scoped regeneration, and practice mode.
- Add keyboard and mobile checks, optimistic/revision-conflict behavior, loading/empty/error states, and end-to-end smoke tests.

**Exit criterion:** a user can complete the required walkthrough entirely through the deployed-style UI, including an edit that survives category regeneration.

### Phase 5 — Ship, verify, and submit (half day; preserve remaining time as slack)

- Deploy API, database, and web; configure secrets/origins/rewrite; test sessions and full generation on public URLs.
- Run clean-clone setup, CI, evaluator fixtures, and a manual regression against all specified edge cases.
- Finish README, meaningful commit history, public repository settings, and record the walkthrough video.

**Exit criterion:** all submission links work, the exact evaluator command works from a clean clone, and the final demo proves the highest-weighted automated and builder requirements.

## 9. Definition of done

The work is complete only when a deployed authenticated user can generate, inspect, safely edit/reorder/regenerate, practise, and reopen their own valid kit; the root evaluator processes valid and failing cases into Appendix B output; automated coverage/schedule/schema tests pass; and the repository, deployment, README, and walkthrough satisfy every listed submission requirement.

## Research references used for these choices

- [Gemini structured output and validation guidance](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini rate-limit dimensions and retry context](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Vercel external rewrites](https://vercel.com/docs/routing/rewrites)
- [Render Free Web Service limitations](https://render.com/docs/free)
- [MongoDB Atlas Free cluster guidance](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/)
- [Tavily Free plan details](https://www.tavily.com/pricing)
