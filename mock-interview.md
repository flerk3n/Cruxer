# Quick Mock Interview

## Goal

Add a kit-scoped voice interview mode where a signed-in user can practise five questions with a conversational ElevenLabs interviewer, then receive a durable, rubric-based scorecard.

## Scope

- Add a **Quick mock** tab to ready kits.
- Use one private ElevenLabs Agent, with a short-lived server-issued signed conversation URL.
- Give the agent only the current kit's role, company, requirements, and selected questions.
- Persist session lifecycle, ElevenLabs conversation ID, transcript, and structured feedback in MongoDB.
- Display live connection state, microphone state, elapsed time, transcript turns, completion state, and the final report.
- Evaluate completed transcripts against the kit with the existing Gemini structured-output boundary.

## Non-goals

- No raw audio storage.
- No one-agent-per-kit provisioning.
- No long-form adaptive assessment, video, or recruiter-facing reports in this iteration.
- No use of client-side ElevenLabs API keys.

## Phases

### 1. Foundation and security

1. Add optional server-only ElevenLabs configuration (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`).
2. Add a `MockInterviewSession` model with ownership, kit relationship, lifecycle, transcript, report, and provider conversation ID.
3. Add authenticated, kit-owned APIs to create sessions, issue signed URLs, read sessions, and end sessions.
4. Retrieve the completed conversation directly from ElevenLabs after the call ends, polling briefly until its transcript is ready.

### 2. Interview runtime

1. Add `@elevenlabs/react` and the Quick mock kit tab.
2. Start a session only after browser microphone permission and signed-URL retrieval.
3. Pass compact, kit-specific context at conversation initiation; constrain the interviewer to five questions and constructive follow-ups.
4. Render live transcript, connection state, timer, speaking indicators, and explicit exit controls.

### 3. Evaluation and reporting

1. Validate the incoming transcript and queue an evaluation after the call completes.
2. Run Gemini against a Zod scorecard schema: overall score, category scores, strengths, gaps, evidence, and next practice actions.
3. Persist and surface the result while making in-progress and failed evaluation states clear.

### 4. Quality and release readiness

1. Add route/service tests for ownership, missing configuration, signed URL responses, transcript polling, and malformed provider responses.
2. Test microphone denial, early exit, lost connection, delayed transcript processing, and no-response sessions.
3. Document ElevenLabs agent setup, Render environment variables, direct transcript retrieval, and usage safeguards.

## Delivery order

Start with Phases 1–2 as a complete secure vertical slice. The live voice UI will be configuration-gated until an ElevenLabs Agent ID and API key are present. Then complete automatic transcript evaluation and reporting rather than presenting fabricated scores.

## Required deployment configuration

- `ELEVENLABS_API_KEY`: server-only API key.
- `ELEVENLABS_AGENT_ID`: private Quick Mock interviewer Agent ID.

## ElevenLabs Agent configuration

Create one private Agent and enable signed-URL authentication. Its system prompt must include `{{interview_context}}` and instruct it to follow that context exactly. Cruxer retrieves the final transcript server-to-server using the configured API key, so no workspace webhook, tunnel, or webhook secret is required.
