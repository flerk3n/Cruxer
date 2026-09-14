# Cruxer — Progress Log

**Last updated:** 2026-09-14 (Asia/Kolkata)  
**Current phase:** Phase 1–2 foundations complete; pipeline implementation next  
**Overall state:** In progress

## Current status

| Area | Status | Evidence / next action |
| --- | --- | --- |
| Assignment scope and architecture | Complete | `plan.md` defines fixed contracts, stack, pipeline, tests, deployment, and phased execution. |
| Product design system | Complete | `design.md` defines visual direction, typography, component rules, responsive behavior, accessibility, and motion. |
| Repository foundation | Complete | npm workspaces, TypeScript, Vitest, and the shared domain package are installed and verified. |
| Backend/API | Foundation complete | Express app, typed configuration, MongoDB models, secure cookie sessions, auth routes, request/error boundary, and health endpoint are implemented in `apps/api`. Kit CRUD/ownership routes remain next. |
| Research/generation pipeline | Foundation complete | Input/output contracts, safe fetching, robots handling, retry policy, crawl/link discovery, research service, and an LLM-ready boundary are implemented in `packages/pipeline`. |
| Frontend | Foundation complete | Next.js App Router shell, responsive design tokens and primitives, initial product routes, theme toggle, ProgressRail, and a reduced-motion-safe GSAP hero reveal are implemented in `apps/web`. |
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

## Active commitments

- Preserve the exact Appendix A kit schema and Appendix B evaluator command.
- Keep UI polish subordinate to the scored interaction requirements: visible progress/failure, accessible editing/reordering, preservation during regeneration, and practice tracking.
- Update this file after every material implementation milestone with status, verification evidence, and any blocker or changed decision.

## Known blockers

None. API keys and deployment accounts are not needed to establish the local foundation; they will be documented in `.env.example` before integration/deployment. `npm install` reports upstream dependency audit advisories; no production application dependency has been selected yet, so they will be reviewed as each runtime dependency is introduced.

## Next milestone

Implement the real Gemini adapter and deliberate multi-stage `KitPipeline`: JD-only extraction with evidence, separately generated question categories, targeted coverage correction, flashcards, deterministic schedule merge, and final Appendix A validation. Then replace the evaluator placeholder so it invokes that exact pipeline.
