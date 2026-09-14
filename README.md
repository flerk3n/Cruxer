# Cruxer

Cruxer turns a pasted job description, company URL, and available preparation days into an evidence-aware interview preparation kit. It researches permitted public sources, extracts only stated role requirements, generates and validates a structured kit, closes question-coverage gaps, and gives the candidate an editable study workspace.

## What it delivers

- Secure, owner-scoped authentication and persisted kits.
- Safe company-site discovery (robots policy, URL/redirect safeguards, bounded HTML retrieval, link ranking) and bounded public interview-discussion search.
- A deliberate generation sequence: JD extraction → company brief → separate question categories → flashcards → deterministic coverage pass → deterministic schedule → Appendix A validation.
- Inline editable questions and flashcards, reorder/category moves, scoped regeneration that preserves manual/edited/pinned content, and practice confidence tracking.
- A Readiness Runway: the next action, exact Day X/N schedule timeline, and an accessible contribution-style daily-effort graph.
- The required shared batch entry point: `npm run evaluate -- --input <cases.json> --output <kits.json>`.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS, GSAP (limited to meaningful motion), deployed to Vercel.
- Node.js/Express, TypeScript, MongoDB/Mongoose, deployed as a Render Web Service.
- MongoDB Atlas Free cluster.
- Gemini 3.1 Flash-Lite through `@google/genai`, using structured JSON outputs. It is a good fit for Cruxer because every prompt is narrow and independently validated; set `GEMINI_MODEL` to override it.
- Tavily for a bounded public-discussion search; native fetch plus a robots-aware, size-limited retriever for company research.
- Zod as the shared boundary validator; all completed kits are checked against Appendix A invariants before persistence.

## Local setup

Requirements: Node 22+, npm 10+, a MongoDB Atlas URI, Gemini API key, and Tavily API key.

```bash
npm install
cp .env.example .env
```

Fill `.env` with real secrets. Quote any value containing shell-significant characters (notably the `&` in a MongoDB URI), for example `MONGODB_URI='mongodb+srv://…?retryWrites=true&w=majority'`. Start each service in its own terminal:

```bash
set -a && source .env && set +a
npm run dev --workspace @cruxer/api
```

```bash
API_ORIGIN=http://localhost:4000 npm run dev --workspace @cruxer/web
```

Open `http://localhost:3000`. The web app uses a same-origin `/api` rewrite when `API_ORIGIN` is configured, keeping the auth cookie first-party.

## Quality checks

```bash
npm run typecheck
npm test
npm run build --workspace @cruxer/web
```

The test suite protects schema/invariants, schedule allocation (including 1 and 60 days), coverage correction, retrieval safety, public-discussion warnings, malformed model output retry, and evaluator failure isolation.

## Batch evaluator

```bash
npm run evaluate -- --input cases.json --output kits.json
```

Input is an Appendix B array of `{ id, jd, company_url, days }`. The evaluator invokes the exact same `CruxerKitPipeline` as the API, processes cases conservatively in sequence for free-tier limits, writes a single Appendix B envelope, and records an individual failure without aborting later cases. Gemini requests are also serialised within each kit using `GEMINI_MIN_REQUEST_INTERVAL_MS` (4.5 seconds by default); provider-advertised 429 retry delays are honoured, and one schema-aware repair is attempted for malformed structured output.

## Architecture and generation sequence

`apps/web` renders the product UI. `apps/api` owns authentication, persistence, generation runs, ownership, revision checks, activity aggregation, and safe HTTP errors. `packages/pipeline` is shared by the API and evaluator; `packages/domain` contains Appendix A schemas plus deterministic schedule and coverage functions.

1. Validate and normalize input; reuse an in-flight generation where appropriate.
2. Enforce URL/robots/content-type/size/retry safeguards and discover relevant same-site pages from actual links.
3. Search a maximum of two public interview-discussion queries. Missing/blocked sources become warnings, not fabricated facts or fatal runs.
4. Extract role facts only from delimited JD text. Requirement evidence must map back to the original JD.
5. Generate the brief, each applicable question category, and flashcards in separate structured calls.
6. Compute coverage in code. Generate targeted gaps; if a provider continues to omit a requirement, add an explicit deterministic fallback question so a completed kit never leaves a must-have uncovered.
7. Allocate the schedule in code: must-have and difficult material first, exact requested days, integer minutes, valid question ids.
8. Validate the whole kit against the Appendix A schema before saving.

## Editing, practice, and study activity

Each kit tracks generated/manual/edited/pinned question state. Category regeneration replaces only unedited generated questions in the requested category; user-authored or edited questions survive. Mutations carry a kit revision, so a stale write returns a conflict rather than overwriting another change.

Practice orders the next flashcards by lower confidence then older review. Confidence events feed a per-user, per-kit daily activity aggregate. The Readiness Runway uses that real activity for its bounded graph, exact schedule-day position, and next-action card. The graph includes keyboard-accessible cells, text/tooltip equivalents, and a visible legend; color is not the only state cue.

## Security and trade-offs

- Passwords are bcrypt-hashed; signed httpOnly, Secure/Lax production cookies authenticate sessions.
- Every protected route checks the kit owner. CORS has an explicit web origin and browser traffic is normally proxied through Vercel.
- Retrieval rejects non-HTTP(S), credential-bearing, private/loopback production URLs, and unsafe redirects; it bounds time, response type and response size. Local evaluator fixtures are permitted only outside production.
- Fetched pages and pasted JDs are delimited content, never instructions. LLM JSON and final kits receive runtime validation.
- Render Free can cold-start and has no durable local filesystem; all state is MongoDB. Provider quotas vary, so requests are paced, retries are bounded, and warnings are surfaced. A production deployment needs the listed secrets and service accounts.

## Deployment

The repository includes a Render Blueprint and Vercel configuration. Create an Atlas cluster, add each service’s secret values, deploy the API with Render, set Vercel’s `API_ORIGIN` to the Render API URL and `WEB_ORIGIN` to the Vercel URL, then verify `/health`, registration, generation, and the evaluator. See `.env.example` for every application variable.

## Sources

Cruxer uses the submitted company site only where robots policy permits and Tavily search results for public interview discussion. It records actual pages used in every kit. The Gemini [structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini 3.1 Flash-Lite model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [Vercel rewrites documentation](https://vercel.com/docs/routing/rewrites), [Render Free guidance](https://render.com/docs/free), and [MongoDB Atlas Free-cluster guidance](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/) informed the platform choices.
