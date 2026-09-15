# Cruxer

Cruxer turns a pasted job description, company URL, and number of preparation days into an editable interview-preparation kit. It extracts only source-grounded role requirements, researches permitted company and public interview-process sources, builds an Appendix A-compatible kit through deliberate stages, closes question-coverage gaps in code, and gives each authenticated user a persistent practice workspace. It also includes an optional **Quick Mock Interview** custom feature: a live ElevenLabs voice interviewer built from the current kit, followed by an AI-generated scorecard.

The application is deliberately a preparation tool, not a job board, CV writer, or application tracker. The voice mock is a focused, kit-scoped practice extension rather than a general-purpose video-interview platform.

## Contents

- [What is implemented](#what-is-implemented)
- [Technology choices](#technology-choices)
- [Architecture](#architecture)
- [Research, generation, and validation](#research-generation-and-validation)
- [Coverage, schedules, and flashcards](#coverage-schedules-and-flashcards)
- [Builder state and regeneration](#builder-state-and-regeneration)
- [Practice and the creative feature](#practice-and-the-creative-feature)
- [Quick Mock Interview custom feature](#quick-mock-interview-custom-feature)
- [Safety, failure handling, and limitations](#safety-failure-handling-and-limitations)
- [Local setup](#local-setup)
- [Batch evaluator](#batch-evaluator)
- [Deployment](#deployment)
- [Verification and walkthrough](#verification-and-walkthrough)

## What is implemented

- Registration, login, logout, expiring signed sessions, protected dashboard routes, and owner-scoped API access.
- One persistent kit per role submission. A user prepares for multiple roles by creating another kit; all active kits appear together in the dashboard and practice library.
- A visible, durable generation run with step-by-step progress, warnings, retryable failures, and duplicate in-flight request protection.
- A structured kit containing a company brief, evidence-bound role breakdown, categorised questions, flashcards, exact-day schedule, and coverage result.
- Inline company-brief, question, answer-outline, and flashcard edits; question reordering and category movement; manual questions/flashcards; deletion; and narrow regeneration.
- Flashcard practice with answer reveal, saved confidence ratings, lowest-confidence-first ordering, completion state, and a dashboard-wide activity/contribution graph.
- Optional **Quick Mock Interview** tab in every ready kit: a private signed ElevenLabs voice session that asks up to five kit-specific questions, saves the final transcript, and returns a Gemini/Zod scorecard.
- The mandatory evaluator command: `npm run evaluate -- --input <cases.json> --output <kits.json>`.

## Technology choices

| Area | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS | Matches the preferred stack; gives a typed, component-based responsive UI and straightforward Vercel deployment. |
| UI motion | Motion, targeted GSAP, Lucide | Motion is used for local interaction feedback and GSAP only for one-time, reduced-motion-safe workspace reveals; neither affects data correctness. |
| API | Node.js, Express, TypeScript | Matches the preferred stack and is better suited than a short-lived serverless function for a multi-step generation run and polling contract. |
| Database | MongoDB Atlas with Mongoose | A free-tier managed database for users, kits, generation runs, revision state, and practice activity. |
| LLM | Gemini 3.1 Flash-Lite via `@google/genai` | Its structured JSON response mode suits narrowly scoped, schema-validated calls at a free-tier-friendly cost. `GEMINI_MODEL` permits an override. |
| Voice mock interview (custom feature) | ElevenLabs Agents + `@elevenlabs/react` | A browser microphone session uses a short-lived signed URL; the server retrieves the durable conversation transcript and evaluates it without exposing the ElevenLabs API key. |
| Public-discussion search | Tavily | Bounded, source-attributed search results make public interview discussion discoverable without hard-coding websites. |
| Company retrieval | Native `fetch`, HTML link/text processing, robots-aware policy | Keeps crawling bounded and auditable without a headless browser. |
| Validation | Zod | Validates browser/API input, individual model responses, the final Appendix A kit, and the persisted payload. |
| Hosting | Vercel web + Render API + MongoDB Atlas | All three have usable free tiers. The API owns all secrets; Vercel proxies `/api/*` to Render so browser session cookies stay first-party. |

## Architecture

```text
Next.js web (Vercel)
  └─ same-origin /api rewrite
       └─ Express API (Render)
            ├─ authentication, ownership, revisions, generation-run polling
            ├─ MongoDB Atlas: users, kits, runs, confidence/activity
            ├─ ElevenLabs: signed voice sessions + completed transcript retrieval
            ├─ Gemini: mock-interview scorecard evaluation
            └─ shared CruxerKitPipeline
                 ├─ safe company crawl + robots policy
                 ├─ Tavily public-discussion search
                 ├─ Gemini structured generation
                 ├─ deterministic coverage correction and schedule allocation
                 └─ Appendix A Zod validation

Batch CLI → same CruxerKitPipeline → Appendix B JSON output
```

`apps/web` contains the interface. `apps/api` owns HTTP, authentication, persistence, concurrency, and safe error responses. `packages/pipeline` contains retrieval and the shared generation pipeline used by both the API and evaluator. `packages/domain` owns the Appendix A schema plus deterministic coverage and schedule functions. This separation prevents the evaluator and UI from drifting into separate implementations.

## Research, generation, and validation

### Sources and retrieval policy

Cruxer uses two source classes:

1. **The submitted company site.** It fetches the landing page, discovers actual same-origin links, ranks likely about/careers/hiring/engineering material, and fetches at most five candidate pages. It does not use a fixed list of guessed paths.
2. **Public interview-process discussion.** Tavily receives at most two role-aware queries per kit. Results are bounded, deduplicated, domain-diversified, and boost Reddit, LeetCode, Glassdoor, TeamBlind, and Quora while retaining broader-web recall. A direct result page is fetched only after the same safety and `robots.txt` checks; a bounded, attributed Tavily snippet is retained if direct retrieval is unavailable.

Every fetched page is treated as untrusted data, not instructions. The final kit records the pages actually used in `source.pages_used` and `company_brief.sources`.

### Retrieval safeguards

- Only credential-free `http` and `https` URLs are accepted.
- Production blocks loopback, private, reserved, and DNS-resolved private addresses; local evaluator fixtures are allowed only outside production.
- `robots.txt` is cached per origin and its most-specific rule is respected.
- Redirect targets are checked again, with a five-redirect limit.
- Retrieval accepts only HTML/XHTML/plain-text responses, limits bodies to 1 MB, and applies a 10-second timeout.
- Transient fetch/search failures receive bounded exponential retry; `Retry-After` is honoured where supplied.
- An unreachable discovered page, blocked page, absent hiring page, unavailable public search, or empty public discussion becomes a visible warning and the company-site-only kit can still succeed. The landing page itself must be reachable to produce a company brief.

### Deliberate pipeline sequence

The pipeline is not one “generate everything” prompt. The API and evaluator use this same sequence:

1. **Input:** Zod validates and normalizes the pasted JD, company URL, and 1–60 day range.
2. **Role extraction:** Gemini extracts title, seniority, responsibilities, and requirements from the JD alone. Every model requirement must match JD evidence after normalization; otherwise it is discarded. A narrow, source-line fallback handles malformed extraction without inventing requirements.
3. **Research:** the company crawl and public-discussion search gather only permitted, bounded material and persist warnings honestly.
4. **Company brief:** Gemini writes the brief from the retrieved document set.
5. **Category-specific questions:** Gemini receives separate prompts for technical, behavioural, system-design, and company-fit requirements. The role category determines which calls run; unrelated categories do not share a generic question prompt.
6. **Coverage pass:** application code compares `question.requirement_ids` with stable requirement ids. Missing requirements trigger one targeted Gemini correction pass.
7. **Deterministic fallback:** if that correction still misses a requirement, code creates a clearly requirement-grounded fallback question, then recomputes coverage. This makes a completed kit safe from uncovered must-haves without trusting the model to self-report coverage.
8. **Flashcards:** Gemini creates requirement-linked cards. A short result receives one targeted follow-up, then only question/requirement-grounded fallback cards fill the remaining target.
9. **Schedule:** application code allocates questions across the exact requested number of days.
10. **Final validation:** the complete kit is validated against the Appendix A contract before it is persisted. The API validates the persisted payload again at the database boundary.

### Model resilience

Gemini calls are serialized inside a pipeline instance with a configurable minimum interval (`GEMINI_MIN_REQUEST_INTERVAL_MS=4500` by default) so parallel question categories cannot burst through Flash-Lite free-tier request limits. A Gemini 429 is classified as retryable and respects an advertised retry delay. Invalid JSON, empty responses, and schema mismatches receive one schema-aware repair prompt; a second invalid result fails cleanly rather than looping forever.

## Coverage, schedules, and flashcards

### Coverage policy

Coverage is calculated in code from requirement ids, never from an LLM judgment. There are at most three recorded stages:

1. initial generated questions;
2. one targeted LLM gap-correction pass when needed;
3. deterministic requirement-grounded fallback questions if gaps remain.

The final `coverage.uncovered_requirement_ids` is recomputed from the final question bank, and `coverage.passes` records how far the pipeline had to go. Stable ids and final schema validation ensure each question and scheduled question id points at existing material.

### Deterministic schedule allocation

`buildSchedule()` accepts only an integer 1–60 day range. It ranks questions by whether they cover a must-have requirement, then difficulty, then stable id. The ranked list is distributed over exactly the requested number of consecutive days. When there are fewer questions than days, questions repeat for focused review; when there are no questions, each day remains a valid context/research review block. Each day has a focus, existing question ids, and an integer duration of 20 minutes per scheduled question (or 20 minutes for an empty-context block).

This means must-have and harder material lands earlier and every generated schedule has exactly `days_available` days. Editing questions recomputes schedule and coverage in code; schedule regeneration uses the user’s current questions rather than unrelated ids from a fresh model run.

### Flashcard volume

New/full-regenerated kits target 12–24 cards: two requirement-linked cues per must-have and one per nice-to-have, bounded by the target. Existing kits are never overwritten automatically; the user can explicitly refresh flashcards. A practice session remains honest when no cards exist.

## Builder state and regeneration

The canonical generated kit remains Appendix A-compatible. Editor provenance is stored beside it in MongoDB:

```text
editor.questions[questionId] = { manual, edited, pinned }
```

- **manual:** created by the user;
- **edited:** user changed a generated question;
- **pinned:** user explicitly protects a generated question.

Question mutations include a kit revision. A stale mutation receives a conflict instead of silently overwriting later work. During question-category regeneration, untouched generated questions in the requested category are replaced; manual, edited, and pinned questions survive. Other categories survive untouched. Company-brief, flashcard, and schedule regeneration replace only their named section. Brief edits, flashcard edits/manual additions/deletions, and question edits are persisted immediately with optimistic UI feedback and a safe reload on conflict.

## Practice and the creative feature

Practice is a real study flow rather than a static document: the user reveals one answer at a time and records **Not yet** (0), **Getting there** (50), or **Confident** (100). The most recent rating for each card is persisted. A new or restarted session orders unreviewed cards first, then lower-confidence cards, then older reviews. This simple confidence-weighted approach is deliberately explainable and appropriate for the assignment; it is not presented as a medical-grade spaced-repetition algorithm.

### Creative feature: Readiness Runway

The optional feature is a user-scoped **Readiness Runway** on the dashboard. It combines all ready kits into:

- total cards, reviewed cards, overall progress, and recall confidence;
- a daily-effort contribution graph driven by real confidence events, not fabricated streaks;
- each kit’s schedule day and remaining timeline; and
- a “next action” view that leads the candidate to the weakest material.

It addresses a practical preparation problem: multiple active interview processes otherwise make it difficult to see where effort has actually gone and what should be studied next. The graph is keyboard-accessible and includes non-colour text/tooltip equivalents.

## Quick Mock Interview custom feature

Quick Mock Interview is an optional extension beyond the assignment’s required kit workflow. From a ready kit, a candidate can start a private voice conversation with an ElevenLabs Agent. Cruxer supplies only the selected kit’s company, role, requirements, company brief, and up to five prioritised questions.

- The browser receives a short-lived signed conversation URL, never the ElevenLabs API key.
- The Agent’s configured first message uses `{{role}}` and `{{company}}`, which Cruxer provides dynamically for each session.
- The interviewer follows kit-specific questions with at most one concise follow-up; it does not reveal the source context or give an in-call score.
- When the candidate ends the session, the API retrieves the completed transcript directly from ElevenLabs, polls briefly while provider processing completes, and evaluates it with Gemini against a Zod-validated scorecard.
- The session, transcript, evaluation status, failure reason, and final report are owner- and kit-scoped in MongoDB.

No webhook, tunnel, or ElevenLabs HMAC secret is required. The final report covers overall score, relevance, structure, evidence, clarity, strengths, gaps, and concrete next-session actions. It is coaching feedback, not a hiring decision.

## Safety, failure handling, and limitations

| Situation | Behaviour |
| --- | --- |
| Invalid URL, unsafe address, unsupported content type, oversized response, timeout, or bad redirect | Reject/skip safely with a structured error or warning; never follow a public URL into a private address. |
| Missing hiring/about page | Keep the reachable landing-page research, record a warning, and build an honest brief rather than fabricate a hiring process. |
| No public discussion | Record a warning and generate from the JD and company-site evidence only. |
| Thin two-line JD | Produce a thin kit; only explicit signal-bearing JD lines can become fallback requirements. |
| Invalid model JSON or schema mismatch | Validate every response, send one repair prompt, then surface a retryable/final failure instead of saving malformed output. |
| Provider 429/transient failure | Pace Gemini requests, use bounded exponential retry, honour provider retry delays, and persist a safe retry action if the run cannot finish. |
| Duplicate submission | Owner-scoped input hashing prevents an identical concurrent run; the API returns the existing run reference instead of starting duplicate expensive work. |
| 1-day or 60-day request | The deterministic schedule function is tested at both bounds and always returns exactly the requested number of days. |
| Generation started twice or fails halfway | Durable `GenerationRun` stages are polled by the UI, failures retain clear terminal status, and retryable runs can be restarted safely. |
| Voice provider is unavailable, transcript processing is delayed, or evaluation fails | The mock session has clear `completed`, `evaluating`, `ready`, and `failed` states. The API polls ElevenLabs briefly for a completed transcript and stores a safe failure message rather than fabricating a scorecard. |

Key trade-offs:

- Free providers make request pacing and bounded retrieval more valuable than maximizing concurrent generation speed.
- The company-site landing page is required: without any reachable first-party page, a defensible company brief cannot be produced. Individual discovered pages and public discussion remain non-fatal.
- Render Free can cold-start after inactivity and is not an always-on production SLA. MongoDB Atlas, not the service filesystem, stores state.
- Atlas access from a free host may require an “allow from anywhere” network rule because the host has no stable outbound IP. This does not replace strong database credentials; a higher-security deployment should use static egress or private networking.
- Public-discussion snippets can describe interview format only; they never become verified company facts or role requirements.

## Local setup

### Prerequisites

- Node.js **22.22.0** (or another Node 22 LTS release)
- npm 10+
- MongoDB Atlas database and database-user credentials
- Gemini API key
- Tavily API key
- Optional Quick Mock Interview: ElevenLabs API key and private Agent ID

Install and configure:

```bash
git clone <your-repository-url>
cd Cruxer
npm install
cp .env.example .env
```

Fill `.env` using the reference below. Local shell parsing requires a MongoDB URI containing `&` to be quoted, for example:

```bash
MONGODB_URI='mongodb+srv://user:password@cluster.mongodb.net/cruxer?retryWrites=true&w=majority'
```

Start the API in one terminal:

```bash
set -a && source .env && set +a
npm run dev --workspace @cruxer/api
```

Start the web app in a second terminal:

```bash
API_ORIGIN=http://localhost:4000 npm run dev --workspace @cruxer/web
```

Open `http://localhost:3000`.

### Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NODE_ENV` | API/pipeline | `development`, `test`, or `production`; production blocks local/private retrieval targets and enables secure cookies. |
| `PORT` | API | Local Express port; Render supplies this for a web service. |
| `WEB_ORIGIN` | API | Exact deployed Vercel origin allowed by credentialed CORS. |
| `MONGODB_URI` | API | Atlas connection string; server-only secret. |
| `JWT_SECRET` | API | At least 32 random characters used to sign sessions; generate with `openssl rand -base64 48`. |
| `JWT_TTL_DAYS` | API | Session lifetime, default `7`. |
| `BCRYPT_ROUNDS` | API | Password-hashing work factor, default `12`. |
| `COOKIE_NAME` | API | Session-cookie name, default `cruxer_session`. |
| `GEMINI_API_KEY` | Pipeline | Server-only Gemini credential. |
| `GEMINI_MODEL` | Pipeline | Default `gemini-3.1-flash-lite`. |
| `GEMINI_MIN_REQUEST_INTERVAL_MS` | Pipeline | Minimum gap between Gemini request starts; default `4500`. |
| `TAVILY_API_KEY` | Pipeline | Server-only public-discussion search credential. |
| `ELEVENLABS_API_KEY` | API | Optional server-only credential used to issue signed voice-session URLs and retrieve completed mock-interview transcripts. |
| `ELEVENLABS_AGENT_ID` | API | Optional private ElevenLabs Agent ID for Quick Mock Interview. |
| `FETCH_TIMEOUT_MS` / `FETCH_MAX_BYTES` | Local configuration | Reserved retrieval-limit configuration values in the root example; the current safe-fetch defaults are 10 seconds and 1 MB. |
| `API_ORIGIN` | Next.js server | Render API origin used for Vercel’s same-origin `/api/*` rewrite; never expose it as a browser credential. |
| `SESSION_COOKIE_NAME` | Next.js middleware | Optional server-only cookie name for the dashboard’s fast signed-out redirect; use `cruxer_session` by default and match API `COOKIE_NAME` if customised. |
| `NODE_VERSION` | Render | Set to `22.22.0` to avoid an unbounded platform Node major-version upgrade. |

Never commit `.env`, Atlas credentials, Gemini keys, Tavily keys, ElevenLabs keys, generated `kits.json`, or any evaluator fixture containing private data.

## Batch evaluator

The mandatory clean-clone command is:

```bash
set -a && source .env && set +a
npm run evaluate -- --input cases.json --output kits.json
```

Input must be an Appendix B array:

```json
[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer\\n\\nWe are looking for ...",
    "company_url": "http://localhost:8099/acme/",
    "days": 5
  }
]
```

The evaluator calls the same `CruxerKitPipeline` as the HTTP API, processes cases sequentially, validates the single Appendix B output envelope, and writes one entry per input id. A failure does not abort later cases. A partially researched but otherwise valid kit is `ok`; its Appendix A source lists show the material that was actually available. In the web flow, the corresponding retrieval warnings are also retained on the durable generation run. `failed` is reserved for a case where no kit can be produced.

The default 4.5-second Gemini request gate is designed to keep a normal five-case batch within the assessment’s 15-minute limit while avoiding free-tier request bursts. Live provider availability, site robots policies, and site TLS/WAF behaviour can still make a particular external source unavailable; the evaluator records that outcome honestly.

## Deployment

The included [`render.yaml`](render.yaml) and [`vercel.json`](vercel.json) configure the intended free-tier deployment.

### 1. Deploy the API on Render

Create a **Web Service** from the repository root—not a Static Site or Private Service—because Express must be publicly reachable by Vercel’s rewrite.

```text
Build command: npm ci --include=dev && npm run typecheck --workspace=@cruxer/api
Start command: npm run start --workspace=@cruxer/api
Health check:  /health
```

Set these Render values:

```text
NODE_ENV=production
NODE_VERSION=22.22.0
MONGODB_URI=<Atlas URI, without shell quote characters>
JWT_SECRET=<openssl rand -base64 48 output>
WEB_ORIGIN=<Vercel production URL, added after Vercel deploys>
GEMINI_API_KEY=<secret>
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_MIN_REQUEST_INTERVAL_MS=4500
TAVILY_API_KEY=<secret>
ELEVENLABS_API_KEY=<secret, optional Quick Mock Interview feature>
ELEVENLABS_AGENT_ID=agent_<your-private-agent-id>
```

Atlas must allow the Render service to connect. For the free-tier deployment, that commonly means a temporary/public-host access-list entry of `0.0.0.0/0`; it permits connection attempts, not database reads without valid database credentials and TLS. Prefer static egress or private networking for a higher-security deployment.

After deploy, verify:

```bash
curl https://<render-service>.onrender.com/health
```

### 2. Deploy the web app on Vercel

Import the same repository with the **repository root** as Root Directory. The root `vercel.json` installs the workspace dependencies and runs:

```text
npm run build --workspace=@cruxer/web
```

Set the Production variable:

```text
API_ORIGIN=https://<render-service>.onrender.com
SESSION_COOKIE_NAME=cruxer_session
```

Do **not** put MongoDB, JWT, Gemini, or Tavily secrets in Vercel. `API_ORIGIN` configures a server-side rewrite from `/api/*` to Render; it keeps browser session cookies same-origin. After Vercel produces its public URL, update Render’s `WEB_ORIGIN` to that exact URL and redeploy the API.

### 3. Public-release check

1. Open the Vercel URL.
2. Register a new user, sign out, and sign back in.
3. Create a kit, watch every generation stage, and refresh after it reaches `ready`.
4. Edit and pin a question, regenerate that category, and confirm it remains.
5. Rate flashcards, verify the dashboard activity/confidence update, and begin a new lowest-confidence-first session.
6. If enabled, start and end a Quick Mock Interview; confirm the kit-specific transcript and scorecard appear.
7. Confirm the Render `/health` URL is reachable and no secrets appear in browser bundles or Git history.

Before submission, replace the deployment URL in the Trao form with the active Vercel URL and provide repository access. The README intentionally does not invent a public URL that has not been deployed.

## Verification and walkthrough

Run the local quality gate:

```bash
npm test
npm test --workspace @cruxer/api
npm run typecheck
npm run build --workspace @cruxer/web
git diff --check
```

The test suite covers Appendix A structure validation, stable id/reference invariants, coverage correction and deterministic fallback, schedule allocation including 1 and 60 days, robots/safe retrieval primitives, public-discussion warnings, Gemini pacing/retry/schema repair, evaluator failure isolation, ownership, revision conflicts, brief persistence, scoped regeneration, and practice scoring.

## Reference sources

- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [MongoDB Atlas free clusters](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/)
- [Render free instances](https://render.com/docs/free)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
- [ElevenLabs Agents React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react)
- [ElevenLabs conversation details API](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get)
