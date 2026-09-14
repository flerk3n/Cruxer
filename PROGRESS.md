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
| Generated study material | Complete | Evidence matching tolerates harmless provider whitespace/punctuation changes, source-grounded JD-line fallback prevents empty requirement sets for substantive postings, and question-derived flashcards cover valid empty-card responses. |
| Frontend | Core flow complete | Live auth/dashboard/generation polling, optimistic persisted builder edits, conflict reload, scoped regeneration states, practice confidence, and the Readiness Runway/activity graph are implemented. |
| Workspace experience | Complete | The dashboard is now user-scoped: it combines all ready kits into readiness totals, per-kit progress, and one 35-day activity graph. Practice is a kit selector, Settings is a real account/preferences page, and `⌘K`/`Ctrl+K` opens workspace navigation. |
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
- Fixed empty generated kits: when provider evidence formatting does not exactly match the source, requirements now use normalized evidence matching and a bounded fallback that copies only explicit, signal-bearing JD lines. Empty valid flashcard output now receives question-derived recall cards.
- Removed Atlas/sample content from the kit and standalone practice routes. Empty generated material is shown honestly rather than rendered as a demo. Re-ran the affected local Trao kit successfully: 9 requirements, 15 questions, and 12 flashcards persisted.
- Re-verified: 26 shared tests, 8 API tests, all workspace type checks, production web build, and whitespace validation pass.
- Scoped authentication rate limiting to password-bearing login/registration requests. Dashboard `GET /auth/session` reads are no longer counted as credential attempts; a regression test verifies 30 authenticated session reads remain available. Re-verified with 26 shared tests, 9 API tests, workspace type checks, and a production web build.
- Moved readiness and daily effort from kit pages to a user-scoped workspace dashboard. The new authenticated aggregate endpoint combines all ready-kit flashcard progress and activity by calendar day without fabricating missed effort. Rebuilt the overview as a real dashboard with welcome state, quote, workspace totals, combined progress, GitHub-style graph, and kit list.
- Added a role-specific practice library, functioning account/settings route, and accessible `⌘K`/`Ctrl+K` command palette. Removed the obsolete kit-specific Readiness Runway component. Live local endpoint verification returned aggregated ready kits and a 35-day activity series.
- Added requirement-aware flashcard volume and coverage: new/full-regenerated kits target at least 12 cards, two cues for each must-have requirement and one for each nice-to-have, capped at 24. A short model result receives one targeted follow-up generation pass, then only question/requirement-grounded fallback cues for remaining gaps. Existing kits are intentionally not overwritten automatically.
- Added a scoped “Refresh flashcards” action in practice so an existing kit can adopt the new flashcard target without recreating the role or replacing questions and other editor-owned material.
- Corrected flashcard refresh and session behavior: the UI now waits for the asynchronous scoped regeneration to finish before loading its persisted cards, resets into that refreshed set, caps the counter at the kit total, and shows a dedicated completion state with a session-only “Start it over” reset.
- Added durable recall scoring for flashcards: `Not yet` contributes 0, `Getting there` 50, and `Confident` 100. Each card persists its latest weighted rating (with backward-compatible handling for existing progress), completed sessions show their recall result, and the workspace dashboard exposes current confidence across all active kits and per kit.
- Fixed account identity flow: registration now validates and persists the supplied name, session responses return it, and the dashboard greeting uses it instead of deriving a name from the email address. Existing records without a stored name retain a safe email-prefix fallback.
- Strengthened Tavily-backed public-interview research: role-aware exact-name queries now boost relevant public discussion domains while retaining broad-web recall, Tavily’s bounded result snippets provide an attributed fallback when an allowed direct fetch is unavailable, and generation reserves two of six research slots for public discussion. Prompts explicitly limit candidate reports to optional interview-format framing, never requirements or verified company facts.
- Repaired scoped question regeneration UX: “All” now regenerates all question categories rather than silently targeting technical questions, the question bank displays live run-stage feedback until the persisted kit is reloaded, and empty categories now explain when the JD lacks matching requirements instead of appearing to ignore the action.
- Refined the practice flashcard surface: removed verbose requirement labels from individual cards and introduced a focused recall-card treatment with depth, minimal metadata, a clearer answer reveal, and reduced-motion-safe visual accents.
- Revamped the authenticated workspace without changing the landing page: added a centred floating dock, workspace-only midnight-indigo colour system and DM Sans typography, bento dashboard, elevated creation/practice/settings panels, top-centre accessible toast viewport, Motion-based gestures/layout entrances, and GSAP’s scoped one-time dashboard scroll reveals. Added `motion` as the React animation dependency; all workspace and API/shared type checks plus the web production build pass.
- Replaced the custom dock with the generated Magic UI dock after initializing the local shadcn registry. The dock now sits in a full-width flex-centred rail and uses Cruxer’s own palette and Lucide icon set; shadcn’s unsolicited global/button/theme rewrites and dependencies were removed. All 40 tests, workspace type checks, and the production build pass.

## Active commitments

- Preserve the exact Appendix A kit schema and Appendix B evaluator command.
- Keep UI polish subordinate to the scored interaction requirements: visible progress/failure, accessible editing/reordering, preservation during regeneration, and practice tracking.
- Update this file after every material implementation milestone with status, verification evidence, and any blocker or changed decision.

## Known blockers

Public deployment requires the user’s MongoDB Atlas, Gemini, Tavily, Render, and Vercel accounts/secrets; no local code change can safely substitute for them. Required values and the exact host-to-host mapping are documented in README and the environment templates. `npm install` reports 10 upstream audit advisories; no automatic or breaking audit remediation has been applied.

## Next milestone

Provision the documented secrets, apply `render.yaml`, deploy Vercel with its server-side `API_ORIGIN`, verify the public health/auth/generation paths and clean-clone evaluator, then record the required 3–4 minute walkthrough.
