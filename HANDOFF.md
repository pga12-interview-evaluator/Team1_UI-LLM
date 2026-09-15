# Team 1 (UI + LLM) — Handoff

_Last updated 2026-09-15 · repo `pga12-interview-evaluator/Team1_UI-LLM` · main @ `97d1c17`_

## 1. What exists and works today

| Piece | Where | State |
|---|---|---|
| Cross-examination prompt pack (01 blueprint → 02 interviewer → 03 evaluator → 04 report) + contracts | `prompts_v2/` | Done. `contracts_version 2.1.1`. Live smoke 33/33 on `gemini-3.5-flash` (`prompts_v2/tests/`) |
| Frontend: candidate interview studio, practice workspace, recruiter console | `frontend/` (Next.js 16) | Done. Light professional theme, animations, a11y, e2e |
| **Real backend inside the app** (`/api/v1`): resume ingest → Gemini 01/02/03/04 → report | `frontend/src/server/` | Done, verified end to end with a real resume |
| Voice answers → Whisper | `frontend/src/lib/media/wav.ts` + `voice_to_text/server.py` | Done. Browser sends 16 kHz WAV; FastAPI wrapper over `voice_to_text.py`, which carries Team 2's decoding settings (Hinglish/tech base prompt, beam 5, no-speech 0.6 — see `voice_to_text/team2/README.md`) |
| Body language → non-scored attention flags (Team 3) | `body_language/server.py` (wraps `Team3_Body_language/`, unmodified) + `frontend/src/server/engine/behavioral*.ts` + `hooks/useFrameCapture.ts` | Done. Browser streams JPEG frames per answer; service returns Team 3 report + derived metrics; BFF builds `behavioral_signals/1.0`, fuses vs warm-up baseline, feeds `attention_flags` to 02 only, §14 attention boost, report block |
| Mock backend for demos / e2e (no keys) | `frontend/src/mock/` (`/api/mock`) | Done. `NEXT_PUBLIC_API_MODE=mock` |
| Executable Python runtime from the parallel track | `production_v2/` | Reference only; different payload shapes, not wired to the UI |
| Guides | `AI_Interview_System_Guide_v2.html`, `AI_Interview_Production_Playbook_v2.html`, `legacy_v1/` | Reference |

**Proven flow (2026-09-15, real Gemini + Whisper):** resume → blueprint (≈2–3 min) → warm-up → resume-verification question → bluff answer → 03 flags the dodge → PIN follow-up → voice answer transcribed → honest answer scored 4 → case scenario generated → stop → 04 report (`insufficient_evidence` for the early stop, `honest_down_scope` credited, practice feedback).

## 2. Run it

```bash
# terminal 1 — Whisper (loads model once)
cd voice_to_text && pip install -r requirements.txt && python server.py        # :8008

# terminal 2 — body language (own venv; optional)
cd body_language && .venv/Scripts/python server.py                            # :8009

# terminal 3 — app
cd frontend && npm install && npm run dev                                     # :3000
```

`frontend/.env.local` (git-ignored) must contain `GEMINI_API_KEY`. Full details, health check, troubleshooting: **`frontend/docs/RUNBOOK.md`**.

Routes: `/setup` (create interview from resume) · `/i/<token>` (candidate) · `/console` (reviewer; any work email + `CONSOLE_DEV_PASSWORD`) · `/api/v1/console/health`.

## 3. Where things live (start here when reading code)

- `frontend/docs/RUNBOOK.md` — key location, startup, per-answer flow, **code map of `src/server/`**, implemented-vs-simplified table, troubleshooting.
- `frontend/docs/ARCHITECTURE.md` — full directory map, UI state machine, the 8 UI invariants (DTO whitelist, no praise, rights bar, non-scored behavioral block…).
- `frontend/docs/api-contract.md` — HTTP contract between UI and BFF (mirrors `lib/api/schemas/*`).
- `frontend/docs/FRONTEND-HANDOFF.md` — the studio/recordings/workspace features and their caveats.
- `prompts_v2/00_shared_contracts.md` — source of truth for every field name, enum, quota, script.
- `prompts_v2/tests/README.md` — prompt-level live smoke test.

## 4. Secrets & safety

- Gemini key: **only** `frontend/.env.local` → `GEMINI_API_KEY` (server-only). Root `.env` is used by the Python tools; both git-ignored.
- **Rotate the current key**: it was printed into `test.ipynb` (now git-ignored, never pushed — GitHub push protection blocked it).
- Candidate channel returns a strict 7-key DTO; console is cookie-gated (dev-grade signed cookie — replace with the org IdP before any external deployment).
- Sessions persist as JSON in `frontend/.data/` (git-ignored). Audio lives in memory until transcribed.

## 5. Known gaps / next steps (priority order)

1. **Ladders, callbacks, reconciliation** — designed in prompts_v2 and expected by 02, but the orchestrator always sends `ladder_instruction: null`, `callback_due: null`, `reconciliation_due: null`. Implement in `src/server/engine/orchestrator.ts` + `state.ts` (00 §9–§11, §15). Ladder plan items are currently skipped.
2. **Behavioral signals — remaining pieces** — Team 3 (gaze/body) is wired end to end (`body_language/README.md`). Still open: speech/fluency producers (Team 2 delivers transcripts only, so `long_pause`, `speech_rate_shift` etc. never fire); `span_hint_text` is always null; `resolved_by_probe` is never filled; Team 3 ships no trained models so the service runs rule-based (drop `gaze/posture/movement` model `.pkl`s in `task3_models/` to switch). Needs a real camera run to tune `GAZE_SHIFT_*` thresholds in `engine/behavioral.ts`.
3. **Auth + persistence for production** — swap mock cookie for SSO; move `.data/` JSON to a DB; rate-limit `/setup` and the candidate channel.
4. **Latency** — blueprint 1–3 min (starts at `/setup` submit, hidden behind consent/device steps). Options: `gemini-3.5-flash-lite` for 01 only, or requisition-mode pre-generation per role (already supported by Prompt 01 `mode: requisition`).
5. **Hindi** — scripts translated (`policy.ts`), UI chrome partial (`lib/i18n`); Whisper hint + `language=hi` passed; needs a real Hindi test run.
6. **Recording upload** — studio recordings stay in the browser (IndexedDB); no server upload defined yet.
7. **Quota** — free-tier 429s appear under load; `GEMINI_MODEL` switch in env; consider a paid project for demos.

## 6. Quality gates (all green at handoff)

```bash
cd frontend
npm run check        # tsc + eslint + 29 unit tests (state machine, DTO whitelist, mock engine, redaction, §14 budget rules)
npm run build
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run e2e   # against a MOCK-mode dev server only (never real — burns quota)
```

CI: `.github/workflows/frontend-ci.yml` (typecheck, lint, format, unit+coverage, e2e on mock, Docker build).

## 7. Contacts / ownership

- Team 1 (this repo): UI, LLM layer, integration, prompts.
- ML teammates: body-language / fumble / hesitation models → deliver the `behavioral_signals` envelope (`00 §12.1`); they are consumed as **non-scored** attention flags only.
- Backend/infra (if split later): implement `frontend/docs/api-contract.md` as a separate service and set `NEXT_PUBLIC_API_BASE_URL` to it; `src/server/` is the reference implementation.
