# Cruxer — Progress Log

**Last updated:** 2026-09-14 (Asia/Kolkata)  
**Current phase:** Generation and application integration complete; persistence editing and release work next  
**Overall state:** In progress

## Current status

| Area | Status | Evidence / next action |
| --- | --- | --- |
| Assignment scope and architecture | Complete | `plan.md` defines fixed contracts, stack, pipeline, tests, deployment, and phased execution. |
| Product design system | Complete | `design.md` defines visual direction, typography, component rules, responsive behavior, accessibility, and motion. |
| Repository foundation | Complete | npm workspaces, TypeScript, Vitest, and the shared domain package are installed and verified. |
| Backend/API | Generation flow complete | Auth, owner-scoped kits, draft input persistence, durable generation runs/retries, progress polling, duplicate-run prevention, and final-kit persistence are implemented. Granular kit editing/practice persistence remains next. |
| Research/generation pipeline | Generation complete | Gemini 3.1 Flash-Lite structured generation, JD evidence checks, source-safe crawling, Tavily public-discussion research, separate question categories, coverage correction/fallback, deterministic schedule, and final Appendix A validation are implemented. |
| Frontend | Generation flow complete | Live credentialed auth, dashboard data, new-kit draft creation, persisted generation polling, error/retry states, responsive builder interactions, and targeted GSAP are implemented. Builder edits still need API persistence. |
| Deployment and walkthrough | Not started | Reserved for the release phase. |

## Completed in this update

- Read and translated the assignment into an execution-only plan.
- Chose a free-tier-capable deployment architecture: Vercel web, Render API, MongoDB Atlas, Gemini structured output, and Tavily search.
- Defined a scope boundary that excludes all out-of-scope and optional features.
- Researched and documented the design-system foundations: shadcn/ui patterns, Radix accessibility primitives, Motion reduced-motion support, and Next.js font loading.
- Created `design.md` and this living progress log before implementation begins.
- Initialized the TypeScript npm-workspaces repository and the required root evaluator command entry point.
- Implemented the shared Appendix A Zod schema and cross-reference invariants for ids, references, coverage, schedule length, day order, and integer durations.
- Implemented deterministic coverage calculation and schedule allocation (including 1-day and 60-day inputs).
- Added and passed 8 domain tests. `npm run typecheck` and `npm test` both pass.
- Accepted GSAP as a targeted UI dependency and documented its limited, accessibility-safe use in `design.md`. It will be installed with the Next.js frontend workspace, rather than added to the domain-only foundation.
- Added the API workspace foundation: typed environment validation, singleton Mongoose connection, User/Kit/GenerationRun/PracticeProgress models, bcrypt registration/login, signed httpOnly session cookies, JWT expiry handling, CORS/Helmet/request-size/rate-limit safeguards, structured request-id errors, and public `/health`.
- Verified the API workspace with `npx tsc -p apps/api/tsconfig.json --noEmit`; the existing 8 domain tests also still pass.
- Added the pipeline foundation: Appendix B schemas, URL/SSRF policy, bounded retrying fetch, robots compliance, same-origin relative-link discovery, text cleaning, and a shared pipeline interface.
- Added the Next.js UI foundation: design tokens, fonts, theme, accessible primitives, responsive routes, ProgressRail, and scoped GSAP motion that respects reduced-motion preferences.
- Integrated workspace dependencies and verified the repository: 15 tests pass, API/web/shared TypeScript checks pass, and the Next.js production build succeeds.
- Selected `gemini-3.1-flash-lite` as the default model after verifying its structured-output and lightweight agentic/data-extraction support. The model is configurable through `GEMINI_MODEL`.
- Implemented the real shared generation path: safe company/public-discussion research, evidence-bound role extraction, company brief, separately prompted categories, flashcards, deterministic coverage correction/scheduling, and final Appendix A validation.
- Replaced the evaluator placeholder. The required CLI now calls the same `CruxerKitPipeline` and writes one Appendix B record per case, including failures without aborting the remaining cases.
- Implemented the live draft → generation-run → polling UI/API contract, owner-scoped persistence, retry, and duplicate generation prevention.
- Verified the integrated codebase: 21 tests pass, shared/API/web TypeScript checks pass, the Next.js production build passes, and the diff has no whitespace errors.

## Active commitments

- Preserve the exact Appendix A kit schema and Appendix B evaluator command.
- Keep UI polish subordinate to the scored interaction requirements: visible progress/failure, accessible editing/reordering, preservation during regeneration, and practice tracking.
- Update this file after every material implementation milestone with status, verification evidence, and any blocker or changed decision.

## Known blockers

No implementation blocker. A Gemini API key, Tavily API key, MongoDB Atlas URI, JWT secret, and deployment accounts are required only for the live deployed path; their names are documented in `.env.example`. `npm install` reports 10 upstream audit advisories; no automatic or breaking audit remediation has been applied.

## Next milestone

Add persisted granular builder mutations (questions/flashcards/reordering/category move/regeneration preservation) and practice-progress endpoints, connect them to the builder, then add API/evaluator integration tests, README, deployment configuration, and public deployment verification.
