# Frontend architecture & code map

Read this first when you open the repo. It tells you where things live, why, and how a turn flows through the code.

## 1. What this app is

One Next.js 16 app, two surfaces, one strict wall between them:

| Surface   | Route        | Who                                   | What it may see                                                                     |
| --------- | ------------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| Candidate | `/i/[token]` | the person being interviewed          | **only** `candidate_turn_dto` (7 keys) — never scores, techniques, ledger, flags    |
| Console   | `/console/*` | recruiters / reviewers (cookie-gated) | requisitions, blueprints, transcripts, evaluations, budget audit, report, audit log |

The backend (BFF) owns state, time, budgets, quotas and Gemini calls. This frontend renders, collects, and asks. It never decides what the interviewer says next.

Until the real BFF exists, an **in-app mock** (`src/mock/`) serves both channels under `/api/mock/*` with a scripted interviewer that reproduces the trap chain (bluff → OWN probe, honest down-scope → advance, break/resume, stop → escalation). Flip `NEXT_PUBLIC_API_MODE=real` to hit the real service; nothing else changes.

## 2. Directory map

```
frontend/
├─ src/
│  ├─ app/                            Next.js App Router (routing only — no business logic here)
│  │  ├─ layout.tsx · globals.css     root shell, design tokens (Tailwind v4 @theme), high-contrast mode
│  │  ├─ page.tsx                     landing (links to demo + console)
│  │  ├─ error.tsx · global-error.tsx · not-found.tsx
│  │  ├─ (candidate)/i/[token]/page.tsx   → features/interview/components/InterviewShell
│  │  ├─ (console)/console/…              → features/console/* (layout wraps QueryClient + i18n)
│  │  └─ api/mock/[...path]/route.ts      catch-all mock BFF (nodejs runtime, mock mode only)
│  ├─ proxy.ts                        Next 16 “middleware”: per-request CSP nonce, security headers, console cookie gate
│  │
│  ├─ features/
│  │  ├─ interview/                   CANDIDATE surface
│  │  │  ├─ machine/interviewMachine.ts     pure state machine (UiState × UiEvent → UiState) + tests
│  │  │  ├─ store/useInterviewStore.ts      Zustand: ui state, server view, draft, modality, idempotency key
│  │  │  ├─ hooks/useSessionSync.ts         initial load + SSE stream + polling fallback + online/offline
│  │  │  ├─ hooks/useAnswerTimer.ts         per-answer countdown from DTO max_answer_seconds (server-anchored)
│  │  │  ├─ hooks/useMediaCapture.ts        mic/camera, level meter, MediaRecorder chunk upload
│  │  │  └─ components/
│  │  │     ├─ InterviewShell.tsx           orchestrator: switch(ui.kind) → screen
│  │  │     ├─ SessionChrome.tsx            header/footer; phase label only — no progress, no counters
│  │  │     ├─ ConsentStep · DeviceCheck · DisclosureStep
│  │  │     ├─ QuestionCard.tsx             the ONLY place model text renders; 1.5 s neutral bridge line
│  │  │     ├─ AnswerComposer.tsx           text/voice answer, timer, auto-submit, idempotent submit
│  │  │     ├─ RightsBar.tsx                Repeat · Rephrase · Break · Adjustment · Stop (+ dialogs)
│  │  │     └─ EndScreens.tsx               Paused · Closing · Escalated · Error
│  │  └─ console/                     CONSOLE surface
│  │     ├─ queries.ts                      TanStack Query hooks + query keys (all server data goes through here)
│  │     ├─ components/ConsoleShell.tsx     sidebar nav, PageHeader; ConsoleProviders.tsx; StatusBadge.tsx; Dashboard.tsx
│  │     ├─ auth/LoginForm.tsx
│  │     ├─ requisitions/  RequisitionList · RequisitionForm (zod + RHF) · RequisitionDetail (blueprint review, freeze, invite)
│  │     ├─ sessions/      SessionList · SessionDetail (tabs: transcript, evaluations, budget audit, versions)
│  │     ├─ report/        ReportView · DecisionForm · NonScoredBlock
│  │     └─ audit/         AuditList
│  │
│  ├─ lib/
│  │  ├─ api/client.ts                fetch wrapper: zod-validated responses, retries, Idempotency-Key, ApiError
│  │  ├─ api/candidate.ts · console.ts   endpoint modules (the only place URLs are written)
│  │  ├─ api/schemas/candidate.ts     candidate_turn_dto (.strict()), session view, consent, answer, requests, SSE events
│  │  ├─ api/schemas/console.ts       requisition, blueprint summary, session summary/detail, transcript, evaluation, budget audit, final report, human decision, audit event
│  │  ├─ config/env.ts                zod-validated env (public + server)
│  │  ├─ i18n/                        UI chrome dictionaries (en, hi) + provider; interview text is NOT translated here
│  │  ├─ telemetry/track.ts           typed event facade (no candidate text ever)
│  │  └─ utils/                       cn, time, ids
│  │
│  ├─ components/ui/                  design-system primitives: Button, Card, Badge, Field(Input/Textarea/Select/Checkbox), Dialog(<dialog>), Table, Tabs, Alert, Skeleton
│  ├─ mock/                           in-app mock BFF (dev/test only)
│  │  ├─ store.ts                     globalThis-persisted in-memory DB + pub/sub for SSE
│  │  ├─ seed.ts                      demo requisitions, demo invite token "demo"
│  │  ├─ auth.ts                      signed HttpOnly cookie, dev directory
│  │  ├─ handlers.ts                  route dispatch for /candidate/* and /console/*
│  │  ├─ engine/interviewer.ts        scripted interviewer + heuristic “evaluator” (stand-in for Prompts 02/03)
│  │  ├─ engine/report.ts             deterministic report builder (stand-in for Prompt 04)
│  │  └─ fixtures/plan.ts · scripts.ts   synthetic plan (FP&A) and the fixed scripts (00 §19)
│  ├─ types/speech.d.ts               Web Speech API typings for optional captions
│  └─ test/setup.ts
├─ e2e/                               Playwright: candidate-flow.spec.ts, console.spec.ts
├─ docs/                              this file, api-contract.md
├─ Dockerfile · .dockerignore · vitest.config.mts · playwright.config.ts · .env.example
```

Rule of thumb: **`app/` routes, `features/` behaviour, `lib/` contracts and plumbing, `components/ui` looks, `mock/` pretend backend.** If you are adding a screen, start in `features/`, then add a thin page under `app/`.

## 3. How one candidate turn flows

```
server view ──SSE/poll──▶ useSessionSync ──dispatch(SERVER_PUSH)──▶ interviewMachine.reduce ──▶ store.ui
                                                                                          │
InterviewShell  switch(ui.kind) ──▶ QuestionCard (candidate_message verbatim) + AnswerComposer + RightsBar
                                                                                          │
AnswerComposer.submit ──dispatch(SUBMIT_START)──▶ candidateApi.submitAnswer(token, payload, idempotencyKey)
        │                                                     │
        │  (voice) media.stopRecording() → media_ref          ▼ zod-validated CandidateSessionView
        └──────────────────────────────────────────── dispatch(SUBMIT_OK, view) ──▶ next turn on screen
```

- `stateFromView(view)` is a pure projection from the authoritative server `status` + `current_turn` to a UI state. Client-only states (`submitting`, `requesting`, `error`) are layered on top by `reduce`.
- A stale SSE push while an answer is in flight is ignored unless it carries a **new turn index**, a closing, a pause or an escalation (see tests).
- Every mutating call carries an `Idempotency-Key`; the answer key is reused on retry so the backend never double-applies.

## 4. Invariants the UI enforces (do not break)

1. **DTO whitelist** — `candidateTurnDtoSchema` is `.strict()`. Any extra key = contract violation = nothing renders. Test: `interviewMachine.test.ts`.
2. **No praise, no reactions** — the UI never composes interviewer text. Only `candidate_message` and fixed bridge lines (`Noted.`) are shown. e2e asserts the page never contains praise words.
3. **No progress signals** — no question counter, no progress bar, no interview clock. Only the DTO's per-answer timer and `phase_label`.
4. **Rights always reachable** — Repeat/Rephrase/Break/Adjustment/Stop are rendered on every interview state; disabled only while a request is in flight.
5. **Accommodation-first** — the adjustment dialog never asks why; `high_contrast` toggles `data-contrast="high"` on `<html>`; `text_modality`/`camera_off` change capture immediately.
6. **Behavioral signals are non-scored** — the console renders `non_scored_behavioral_context` last, collapsed, under the fixed disclaimer, and omits it when capture was disabled. It is never adjacent to a score.
7. **Human decision ≠ model label** — `DecisionForm` records decision + reason separately; the label is shown as a signal with a warning banner.
8. **Console is server-gated** — `proxy.ts` redirects without a cookie (optimistic); the API re-validates the signed cookie on every call.

## 5. State machine (candidate)

```
loading ──LOAD_OK──▶ consent ─▶ device_check ─▶ disclosure ─▶ asking ⇄ submitting ─▶ asking …
                                                               │  ▲          │
                                                               │  └─requesting (rights)
                                                               ├─▶ paused ─resume─▶ asking
                                                               ├─▶ candidate_questions ─▶ closing
                                                               └─▶ escalated
   any ──*_FAIL──▶ error ──RETRY──▶ previous
```

Server `status` → UI kind: `awaiting_consent→consent`, `device_check`, `ready→disclosure`, `active/disclosed→asking|candidate_questions|closing (by turn)`, `evaluating→submitting`, `paused`, `closed→closing`, `escalated`.

## 6. Environment & modes

| Var                        | Where      | Meaning                                                              |
| -------------------------- | ---------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_MODE`     | build-time | `mock` → `/api/mock` (this app); `real` → `NEXT_PUBLIC_API_BASE_URL` |
| `NEXT_PUBLIC_API_BASE_URL` | build-time | real BFF base, e.g. `https://api.example.com/api/v1`                 |
| `CONSOLE_DEV_PASSWORD`     | server     | mock console login (dev only)                                        |
| `CONSOLE_COOKIE_SECRET`    | server     | HMAC secret for the console cookie                                   |

## 7. Commands

```bash
npm run dev            # http://localhost:3000  (demo interview: /i/demo, console: /console)
npm run check          # typecheck + lint + unit tests
npm run test           # vitest (machine, engine, DTO whitelist)
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run e2e   # against a running dev server
npm run build && npm run e2e                            # CI style: production server on :3100
docker build -t ai-interview-frontend --build-arg NEXT_PUBLIC_API_MODE=real --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 .
```

## 8. Where to plug the real backend

1. Implement the endpoints in `docs/api-contract.md` (they mirror `lib/api/schemas/*`).
2. Set `NEXT_PUBLIC_API_MODE=real` and `NEXT_PUBLIC_API_BASE_URL`.
3. Replace the mock cookie auth with your IdP: keep the cookie name (`console_session`) or update `proxy.ts` + `lib/api/console.ts` together.
4. Keep the SSE event shape (`sessionEventSchema`) or the client falls back to polling automatically.
5. Media: the BFF should accept multipart chunks at `/candidate/sessions/{token}/media` and return `{media_ref, received_bytes}`; ASR happens server-side.

## 9. Testing strategy

- **Unit (vitest, jsdom)** — state machine transitions, DTO whitelist, mock engine heuristics (trap fires on collective/unanchored answers, honest down-scope credited, escalation, break/resume, accommodations).
- **E2E (Playwright)** — candidate journey through the trap chain to escalation; console gate → report → decision; requisition form validation (intense-pressure rationale).
- **Contract** — every response is parsed with zod at the boundary; a drift surfaces as `ApiError(code: "contract_violation")` and a telemetry event, never as a silent wrong render.
