# RUNBOOK — run the real interview end to end (Gemini + Whisper)

This is the "where does the key go, what do I start, where is the code" page. Read `ARCHITECTURE.md` for the deeper map.

## 0. What "real mode" means

`NEXT_PUBLIC_API_MODE=real` makes the browser call `/api/v1/*` — route handlers **inside this Next.js app** that:

1. parse + redact the uploaded resume,
2. call Gemini with the `prompts_v2` system instructions (01 blueprint → 02 interviewer → 03 evaluator → 04 report),
3. send recorded answers (16 kHz WAV) to the Whisper service in `voice_to_text/server.py`,
4. persist every session as JSON under `frontend/.data/` (git-ignored).

`NEXT_PUBLIC_API_MODE=mock` keeps the scripted demo engine (`/api/mock/*`) — no keys, no network. Use it for UI demos and e2e.

## 1. Where the API key goes (the only place)

`frontend/.env.local` — server-only variables, never `NEXT_PUBLIC_`:

```
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=/api/v1

GEMINI_API_KEY=AIza...            # https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-3.5-flash     # verified with prompts_v2; flash-lite skips anchor-first
WHISPER_URL=http://127.0.0.1:8008 # voice_to_text/server.py
CONSOLE_DEV_PASSWORD=change-me
CONSOLE_COOKIE_SECRET=<32 random chars>
```

Rules: `.env.local` is git-ignored; the root `.env` (used by the Python tools) is also ignored. Never paste the key into a notebook cell that prints it — GitHub push protection blocked exactly that once already. If a key ever leaks, rotate it in AI Studio.

The key is read once, on the server, in `src/lib/config/env.ts` (`getServerEnv()`) and used only by `src/server/gemini.ts`. The browser bundle never contains it (`npm run build` inlines only `NEXT_PUBLIC_*`).

## 2. Start everything (two terminals)

Terminal 1 — Whisper service (loads the model once; ~20 s on CPU):

```bash
cd voice_to_text
pip install -r requirements.txt
python server.py                    # http://127.0.0.1:8008  (WHISPER_MODEL=small for better Hinglish; WHISPER_BEAM_SIZE=1 for speed)
```

Terminal 2 — the app:

```bash
cd frontend
npm install
npm run dev                         # http://localhost:3000
```

Check: sign in to the console (`/console`, any work email + `CONSOLE_DEV_PASSWORD`) and open
`http://localhost:3000/api/v1/console/health` → `{"gemini_key_present":true,"whisper_reachable":true,...}`.

## 3. Run an interview

1. `/setup` → upload a resume (PDF/DOCX/TXT with real text; scanned PDFs are rejected), fill role, seniority, duration, style, language → **Start**.
   The blueprint (Prompt 01, ~1–3 min) starts generating immediately in the background.
2. `/i/<token>` → consent → device check → disclosure → **Begin** (waits for the blueprint if it is still running).
3. Answer by voice (mic) or typed text. Voice: the browser records, converts to 16 kHz WAV on **Finish answer**, uploads once; the server transcribes with Whisper, then runs 03 → 02.
   Typical wait per answer: 10–25 s (03 ≈ 10 s, 02 ≈ 6–8 s; fast path skips 02 when the evaluator's rank-1 probe needs no state).
4. Rights bar always works: Repeat / Rephrase / Break / Adjustment / Stop.
5. When the plan is exhausted or the reserve starts: your-questions phase → fixed closing.
6. Console → Sessions → the session → **Generate report** (Prompt 04, ~40 s) → **Open report** → record the human decision.

## 4. Code map for real mode

````
frontend/src/server/                       ← everything server-only (import "server-only")
├─ gemini.ts            REST client: system instruction + JSON mode + thinkingConfig, per-stage temps/limits, retries, MAX_TOKENS handling
├─ prompts.ts           loads prompts_v2/*.md (the ```text block), substitutes {{..._json}} placeholders, reads prompt/contract versions
├─ store.ts             RealSession type, JSON persistence (.data/sessions/*.json), audit.json, in-memory audio, SSE pub/sub
├─ resume.ts            extractResumeText (pdf-parse / mammoth / utf8) + redactResume (emails, phones, DOB, gender, caste, address…)
├─ whisper.ts           transcribeWav(): multipart POST to WHISPER_URL/transcribe with language + vocab hint; whisperHealthy()
├─ handlers.ts          route dispatch: /candidate/* (token-scoped) and /console/* (cookie); per-session lock; error mapping
└─ engine/
   ├─ policy.ts         00 §16 knobs per pressure level, fixed scripts (EN + HI), accommodation effects, H8 banned-phrase guard
   ├─ state.ts          builders for session_state (02) and assessment_input (03); time modes; 00 §14 probe-budget rules
   ├─ orchestrator.ts   createSession → generateBlueprint (01) → start (02) → answer (Whisper → 03 → budget → fast path / 02)
   │                    requests (repeat/rephrase/break/resume/stop), adjustment, closeInterview, generateReport (04)
   └─ projection.ts     candidateView (strict 7-key DTO), console summary/detail/requisition, 04 output → FinalReport (defensive)

frontend/src/app/api/v1/[...path]/route.ts ← the HTTP entry (nodejs runtime, maxDuration 300 s)
frontend/src/lib/media/wav.ts              ← browser: recorded blob → 16 kHz mono WAV (no ffmpeg anywhere)
frontend/src/features/interview/hooks/useMediaCapture.ts ← records; on stop → WAV → one upload → media_ref
voice_to_text/server.py                    ← FastAPI wrapper over voice_to_text.transcribe (GET /health, POST /transcribe)
prompts_v2/                                ← the four system instructions + 00 contracts (source of truth for every field name)
````

Flow of one answer (real mode):

```
AnswerComposer.submit → stopRecording() → blobToWav16k() → POST /media (media_ref)
  → POST /answers {text, media_ref}
      → orchestrator.answer(): transcribeMedia() [Whisper] → buildAssessmentInput() → Gemini 03
      → mergeLedger(), applyBudgetRules(), projectEvaluation()
      → fast path (rank-1 directive, no state) OR interviewerTurn() [Gemini 02] OR mechanicalAdvance()
      → session.current_turn (strict DTO) → save() → SSE "turn" event → UI renders
```

## 5. What is implemented vs simplified

| Area                                                                                                | Status                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 01 blueprint from resume + JD, single-pass mode                                                     | ✅ (weights normalised if off by >2)                                                                                       |
| 02 live turns with session_state per 00 §6, state-update application, H8 guard with fallback        | ✅                                                                                                                         |
| 03 evaluation, claim ledger (extract + updates), digests, 00 §14 budget/escalation, fast path       | ✅                                                                                                                         |
| Whisper transcription with vocabulary hint (name, title, JD phrases)                                | ✅                                                                                                                         |
| 04 report + console mapping, human decision, audit log                                              | ✅                                                                                                                         |
| Repeat / Break / Resume / Stop / Adjustment handled server-side from fixed scripts; Rephrase via 02 | ✅                                                                                                                         |
| Ladders (L1–L3), callbacks queue, reconciliation turns                                              | ⛔ not run yet — `ladder_instruction`, `callback_due`, `reconciliation_due` are always null; ladder plan items are skipped |
| Behavioral signals / attention flags                                                                | ⛔ not wired — report block says `disabled_by_consent` / `none`                                                            |
| Requisition lifecycle in console (create/freeze/invite)                                             | read-only in real mode; interviews start from `/setup`                                                                     |
| Persistence                                                                                         | JSON files; fine for testing, replace with a DB for multi-instance deployment                                              |
| Gemini failure handling                                                                             | 02 fails → next verbatim main question; 03 fails → advance; 01 fails → error at Begin with the message                     |

## 6. Troubleshooting

| Symptom                                                 | Cause / fix                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `model_not_configured` on `/setup`                      | `GEMINI_API_KEY` missing in `frontend/.env.local`; restart `npm run dev` after editing                                                   |
| Begin spins for minutes then errors `Gemini 429`        | free-tier quota; wait or switch `GEMINI_MODEL` to `gemini-3.5-flash-lite` (anchor-first step is skipped on lite)                         |
| Voice answer → "Audio for this answer was not received" | Whisper service down (`/api/v1/console/health` → `whisper_reachable:false`) or the upload failed; type the answer or restart `server.py` |
| Whisper mangles names                                   | it uses a hint built from candidate name + JD phrases; use `WHISPER_MODEL=small`                                                         |
| `Invalid URL` 500 on every page                         | `NEXT_PUBLIC_API_BASE_URL` must be an absolute URL or a path starting with `/`                                                           |
| Session vanished after restart                          | real mode persists to `.data/`; mock mode is memory-only                                                                                 |
| Console "Generate report" 409                           | session still open — Stop it or finish it first                                                                                          |

## 7. Tests

- `npm run test` — unit (state machine, DTO whitelist, mock engine, resume redaction, budget rules).
- `npm run e2e` — Playwright against **mock** mode (CI). Do not point e2e at real mode; it would burn Gemini quota.
- `prompts_v2/tests/smoke_v2.py` — prompt-level live checks of 02/03 against Gemini (33/33 on gemini-3.5-flash).
