# Cruxer — Progress Log

**Last updated:** 2026-09-14 (Asia/Kolkata)  
**Current phase:** Release-ready locally; public deployment awaits service credentials  
**Overall state:** In progress

## Current status

| Area | Status | Evidence / next action |
| --- | --- | --- |
| Assignment scope and architecture | Complete | `plan.md` defines fixed contracts, stack, pipeline, tests, deployment, and phased execution. |
| Product design system | Complete | `design.md` defines visual direction, typography, component rules, responsive behavior, accessibility, and motion. |
| Repository foundation | Complete | npm workspaces, TypeScript, Vitest, and the shared domain package are installed and verified. |
| Backend/API | Core flow complete | Auth, owner-scoped draft/generation runs, revision-guarded question/flashcard mutations, scoped regeneration preservation, and practice-progress persistence are implemented. |
| Research/generation pipeline | Generation complete | Gemini 3.1 Flash-Lite structured generation, JD evidence checks, source-safe crawling, Tavily public-discussion research, separate question categories, coverage correction/fallback, deterministic schedule, and final Appendix A validation are implemented. |
| Frontend | Core flow complete | Live auth/dashboard/generation polling, optimistic persisted builder edits, conflict reload, scoped regeneration states, practice confidence, and the Readiness Runway/activity graph are implemented. |
| Local generation reliability | Complete | Fixed first-time generation persistence: Mongoose’s empty optional nested regeneration object no longer routes normal runs through regeneration merge logic. Failed runs now offer retry and safe stage-aware diagnostics. |
| Deployment and walkthrough | Configuration complete | Render Blueprint, Vercel rewrite configuration, environment templates, and a submission README are committed. Public URLs and walkthrough recording await service-account access. |

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
- Added evaluator failure-isolation and generation edge-case tests, including thin descriptions, research warnings, malformed schema-valid JSON retries, and Appendix B output.
- Added revision-guarded persistent builder mutations: question/flashcard add, edit, delete, reorder, category move, and preservation-aware regeneration.
- Added persisted practice confidence/progress and connected all builder actions to optimistic web API operations with safe conflict reload.
- Re-verified the integrated application: 25 tests pass, all workspace TypeScript checks pass, the production web build passes, and the diff has no whitespace errors.
- Researched progress, grid, and visual-accessibility patterns and added the Readiness Runway: server-derived Day X/N and remaining-day timeline, today’s next action, daily check-in, and a bounded accessible contribution-style effort graph.
- Added timezone-safe, owner-scoped daily effort aggregation driven by practice confidence so the graph reflects real activity rather than client-only data.
- Re-verified after the UX addition: 25 tests pass, all workspace TypeScript checks pass, the production web build passes, and the diff has no whitespace errors.
- Added isolated API contract tests for authentication, ownership, generation protection, revision conflicts, pinned provenance, and duplicate-run prevention (6 API tests).
- Added Render Blueprint and Vercel deployment configuration, environment templates, and the complete submission README.
- Ran the final local release gate: 25 shared tests, 6 API contract tests, all workspace TypeScript checks, and the production web build pass.
- Diagnosed and fixed a real local generation failure after the pipeline had completed: Mongoose hydrates an omitted nested `regeneration` field as a truthy empty object, which incorrectly invoked the regeneration merge path for a first-time kit. Normal runs now require a valid regeneration section before merging.
- Added safe server-side generation failure logging keyed by run id and stage-specific persistence diagnostics, preserving provider/database details in the API host logs rather than client responses.
- Replaced the misleading Atlas demo fallback for incomplete kits with an honest incomplete state and a working retry flow. Verified the previously failed run reaches `ready` and persists its generated kit; API tests now total 8, and type checks plus the production web build pass.

## Active commitments

- Preserve the exact Appendix A kit schema and Appendix B evaluator command.
- Keep UI polish subordinate to the scored interaction requirements: visible progress/failure, accessible editing/reordering, preservation during regeneration, and practice tracking.
- Update this file after every material implementation milestone with status, verification evidence, and any blocker or changed decision.

## Known blockers

Public deployment requires the user’s MongoDB Atlas, Gemini, Tavily, Render, and Vercel accounts/secrets; no local code change can safely substitute for them. Required values and the exact host-to-host mapping are documented in README and the environment templates. `npm install` reports 10 upstream audit advisories; no automatic or breaking audit remediation has been applied.

## Next milestone

Provision the documented secrets, apply `render.yaml`, deploy Vercel with its server-side `API_ORIGIN`, verify the public health/auth/generation paths and clean-clone evaluator, then record the required 3–4 minute walkthrough.
