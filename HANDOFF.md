# Team 1 (UI + LLM) — Handoff

_Last updated 2026-09-16 · repo `pga12-interview-evaluator/Team1_UI-LLM` · `main` = `prod` @ `4f68bba`_

**LIVE (free tiers):** app `https://interviewly-ow35.onrender.com` (Render, branch `prod`, manual deploy from the Render dashboard after each push — public-URL blueprints do not auto-deploy) · Whisper `https://chaitanya-2002--interviewly-services-voice.modal.run` + body language `https://chaitanya-2002--interviewly-services-body.modal.run` (Modal app `interviewly-services`, redeploy with `deploy/.venv/Scripts/python -m modal deploy deploy/modal/interviewly_services.py`) · Redis `interviewly` on Upstash. Reviewer console password is in Render → Environment. Full cloud run verified 2026-09-16: resume → blueprint → voice answer via Modal → 02 follow-up → stop → review. Details: `DEPLOY.md`.

## 1. What exists and works today

| Piece | Where | State |
|---|---|---|
| Prompt pack 01 blueprint → 02 interviewer → 03 evaluator → 04 report + contracts | `prompts_v2/` | Done. `contracts_version 2.1.1`. Live smoke 33/33 |
| Frontend: candidate studio, practice workspace, reviewer console, practice review | `frontend/` (Next.js 16) | Done |
| Real backend inside the app (`/api/v1`): resume → Gemini 01–04 → report | `frontend/src/server/` | Done, proven end to end with real Gemini + Whisper + camera |
| Voice → Whisper (**Team 2** settings) + **Team 4** delivery analysis | `voice_to_text/` | Done. `team2_settings.py` parses Team 2's notebook (`team2/`) with `ast` and uses their `model.transcribe()` kwargs verbatim; `team4_speech.py` executes only the definitions of Team 4's notebook (`team4/`) on every transcription → fillers, repetitions, pauses, wpm, fluency. Neither notebook is edited |
| Body language (**Team 3**) → non-scored attention flags + presence coaching | `body_language/server.py` wraps `Team3_Body_language/` unmodified; `frontend/src/server/engine/behavioral*.ts`; `hooks/useFrameCapture.ts` | Done. Own venv (`body_language/.venv`, numpy 2). Browser streams JPEG frames only while an answer is being recorded |
| Behavioral envelope + fusion (00 §12) | `engine/behavioral.ts`, `behavioralFlow.ts`, `behavioralStore.ts`, `behavioralReport.ts` | Done. Producers: gaze/body (Team 3), speech_features/fluency (Team 4). Flags: `gaze_shift`, `long_pause`, `speech_rate_shift`, always vs the candidate's own warm-up baseline. 02 only; 03/04 never see it; §14 attention boost; purge on any accommodation |
| Practice review (candidate-facing) | `GET /candidate/sessions/{token}/review`, `engine/review.ts`, `engine/speech.ts`, `features/review/` | Done. Generates 04 on first open. Sections: verdict + KPIs, competencies with quotes and per-answer columns, claims + numbers, habits/ownership/consistency/pressure, answers one by one, delivery (pace curve = kernel-smoothed wpm, words-per-answer, rhythm strips, filler chart, fluency), camera presence meters |
| Interview UX | `features/interview/` | Recording starts only on **Start answering** (cancels read-aloud); `engine/echo.ts` strips an echoed question from the transcript as a safety net; whole-interview clock in the studio panel (`InterviewClock.tsx`) |
| Mock backend for demos / e2e (no keys) | `frontend/src/mock/` | Done. `NEXT_PUBLIC_API_MODE=mock`; `review` and `frames` routes stubbed |
| Free-tier cloud deployment | `DEPLOY.md`, `deploy/modal/`, `Dockerfile.frontend`, `render.yaml`, `src/server/kv.ts` | **Deployed.** Python services on Modal (HF Docker Spaces went PRO-only), app on Render, sessions/audit/behavioral mirrored to Upstash Redis (write-behind + boot hydration; fs JSON locally). `deploy/hf/` kept for anyone with HF PRO |
| Reference material | `production_v2/`, `legacy_v1/`, `*.html` guides | Reference only |

## 2. Run it (3 terminals, repo root)

```bash
cd voice_to_text && python server.py                       # :8008  Whisper + Team 2 settings + Team 4 analysis
cd body_language && .venv\Scripts\python server.py         # :8009  Team 3 (own venv!)
cd frontend && npm run dev                                 # :3000
```

`frontend/.env.local` (git-ignored): `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite`, `CONSOLE_DEV_PASSWORD`, `CONSOLE_COOKIE_SECRET`, `WHISPER_URL`, `BODY_LANGUAGE_URL`. Cloud extras: `SERVICE_TOKEN`, `UPSTASH_REDIS_REST_URL/TOKEN` (see `DEPLOY.md`).

Routes: `/setup` · `/i/<token>` · `/i/<token>/review` · `/review` (all practice sessions on this server) · `/console` (any work email + `CONSOLE_DEV_PASSWORD`) · `/api/v1/console/health` (Gemini key, Whisper, body-language reachability).

First start of each Python service ≈ 20 s (model load). Body-language service must use its venv, never global `python` (numpy 1 vs 2 conflict — global numpy was broken once by a stray `pip install mediapipe`, repaired).

## 3. Where things live

- `frontend/docs/RUNBOOK.md` — keys, startup, per-answer flow, **code map of `src/server/`**, troubleshooting.
- `frontend/docs/ARCHITECTURE.md` — directory map, UI state machine, the 8 UI invariants.
- `frontend/docs/api-contract.md` — HTTP contract (incl. `review`, `frames`, `GET /candidate/sessions`).
- `body_language/README.md`, `voice_to_text/team2/README.md`, `voice_to_text/team4/README.md` — what each team's code provides and exactly where it is consumed.
- `prompts_v2/00_shared_contracts.md` — source of truth for every field, enum, quota, script.
- `DEPLOY.md` — cloud steps.

## 4. Per-answer data flow (real mode)

1. Candidate presses Start answering → `useMediaCapture` records WAV; `useFrameCapture` posts JPEG batches to `…/frames` (→ Team 3 service) while recording.
2. Submit → `…/media` (WAV) then `…/answers`.
3. `engine/orchestrator.answer()`: `transcribeMedia()` (Whisper → text + `duration_sec` + `segments` + Team 4 `speech`, stored on `session.media_refs[ref]`) → `stripQuestionEcho()` → transcript entry → `ingestAnswerSignals()` (finalize Team 3 window + Team 4 speech → envelope → flags, separate behavioral store) → 03 evaluator → budget rules (§14, attention boost) → 02 next turn (with `attention_flags` when capture is on).
4. Close → `/review` builds `PracticeReview` (04 report + 03 evaluations + speech + presence); console gets the reviewer report with the non-scored block.

Note: behavioral capture (and therefore Team 4 flags) is off whenever the camera is off or any accommodation is applied (00 §12.2) — speech metrics still reach the review.

## 5. Known gaps / next steps (priority order)

1. **Cloud hygiene** — Render free sleeps after 15 min (first load ~50 s); Modal cold start ~10 s; Gemini free-tier 429s under load. Render deploys are manual (Manual Deploy → Deploy latest commit) because the blueprint was created from the public repo URL; connecting the GitHub org in Render would enable auto-deploy. Rotate the Gemini key if it was ever pasted in chat.
2. **Ladders, callbacks, reconciliation** — orchestrator still sends `ladder_instruction: null`, `callback_due: null`, `reconciliation_due: null` (00 §9–§11, §15).
3. **Behavioral remaining** — `span_hint_text` always null; `resolved_by_probe` never filled; Team 3 ships no trained `.pkl` models (service runs rule-based; drop models in `task3_models/` to switch); thresholds in `engine/behavioral.ts` (`GAZE_SHIFT_*`, `LONG_PAUSE_*`, `RATE_SHIFT_*`) tuned on one real run only.
4. **Team 3 gaze rule reads low** (5–15 % camera-facing on real runs) — likely their `GAZE_HORIZONTAL/VERTICAL` bands vs laptop webcam placement; not ours to change, but the review's "facing camera" numbers will look harsh until they tune it.
5. **Auth + persistence for production** — SSO instead of the dev cookie; Upstash mirror is a stopgap, a relational DB is the real answer; rate-limit `/setup` and the candidate channel. `/review` lists every practice session on the server (no accounts) — fine for testing, not for real candidates.
6. **Latency / quota** — blueprint 30–90 s on flash-lite; free-tier 429s under load; a paid Gemini project for demos.
7. **Hindi** — scripts translated, UI chrome partial, Whisper `language=hi` passed; needs a real Hindi run.
8. **Recording upload** — studio recordings stay in the browser (IndexedDB).
9. **Answer timer** starts when the question renders, not when Start answering is pressed (server-authoritative `max_answer_seconds`); revisit if candidates run out of time while reading.

## 6. Quality gates (green at handoff)

```bash
cd frontend
npm run check        # tsc + eslint + 51 unit tests (state machine, DTO whitelist, budget rules incl. attention boost, behavioral fusion + firewall, echo strip, speech metrics, resume redaction)
npm run build
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run e2e   # against a MOCK-mode dev server only
```

CI: `.github/workflows/frontend-ci.yml`.

## 7. Working agreements

- Never edit `Team3_Body_language/`, `voice_to_text/team2/`, `voice_to_text/team4/` — wrap, parse or import; if a team changes their file, re-copy it and restart the service.
- Git identity: `CHAITANYA-2002 <72995227+CHAITANYA-2002@users.noreply.github.com>` (repo + global). Older commits still carry a different email; rewriting them needs `git filter-branch` + force-push (commands were given, not run).
- `prod` tracks `main` by fast-forward: `git checkout prod && git merge --ff-only main && git push && git checkout main`.
- `study_material/` and `tmp/` at repo root are personal, untracked — leave them.
