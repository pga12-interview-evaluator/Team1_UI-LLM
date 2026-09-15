# Interviewly — AI Interview Taker (Team 1: UI + LLM)

Gemini-driven interviewer that plans, conducts, scores and reports a job interview from a resume and a job description. Built to be **hard to fake, never unfair**: it drills to artifacts, isolates ownership, interrogates every metric, calls back to earlier statements and finds the candidate's knowledge ceiling — in a neutral, no-praise register with fairness guardrails on every technique.

This repository is the UI + LLM layer of the PGA12 interview evaluator. Body-language / fumble / hesitation models from the ML team feed the interviewer only as **non-scored** attention flags.

**New here? Read [HANDOFF.md](HANDOFF.md) first** — current state, run steps, known gaps, ownership.

---

## Quick start

```bash
# terminal 1 — Whisper speech-to-text (loads the model once)
cd voice_to_text && pip install -r requirements.txt && python server.py     # http://127.0.0.1:8008

# terminal 2 — body language (Team 3, own venv; optional — interview runs without it)
cd body_language && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && .venv/Scripts/python server.py   # :8009

# terminal 3 — app (UI + real backend)
cd frontend && npm install && npm run dev                                  # http://localhost:3000
```

`frontend/.env.local` (git-ignored) must contain `GEMINI_API_KEY`. Full setup, health check and troubleshooting: [frontend/docs/RUNBOOK.md](frontend/docs/RUNBOOK.md).

| Route | What |
|---|---|
| `/setup` | Create a practice interview from a resume + target role |
| `/i/<token>` | Candidate interview studio (voice or text, camera preview, screen share, local recording) |
| `/console` | Reviewer console — any work email + `CONSOLE_DEV_PASSWORD` |
| `/api/v1/console/health` | Backend health (Gemini key, Whisper and body-language service reachability) |

No API keys? `NEXT_PUBLIC_API_MODE=mock` serves a scripted demo interview from `frontend/src/mock/`.

## How a session runs

```
resume + role ──▶ 01 blueprint ──▶ opening script ──▶ 02 live turn ──▶ candidate answer (text / voice→Whisper)
                                                          ▲                     │
                                                          └──── 03 evaluator ◀──┘   (claims, patterns, ranked probes)
                                                                                    … until time reserve …
                                                       closing script ──▶ 04 report ──▶ reviewer console
```

1. **01 blueprint** — competencies, difficulty ladders, verification kits, callbacks, case scenarios.
2. **02 live interviewer** — one question per turn; the candidate only ever sees a strict 7-key DTO.
3. **03 evaluator** — after every answer: anchored score, claim-ledger updates, evidence-quality patterns, up to 3 ranked follow-up directives.
4. **04 report** — post-close only: weighted report, ceiling vs bar, ledger resolution, separate non-scored behavioral block. A human records the decision.

## Repository map

```
.
├─ frontend/                    Next.js 16 app — candidate studio, practice workspace, reviewer console
│  ├─ src/server/               real backend (/api/v1): resume ingest → Gemini 01/02/03/04 → report, Whisper client
│  ├─ src/features/             interview · console · workspace UI
│  ├─ src/lib/api/schemas/      zod contracts (mirrors docs/api-contract.md)
│  ├─ src/mock/                 in-app mock backend for demos and e2e
│  └─ docs/                     RUNBOOK · ARCHITECTURE · api-contract · FRONTEND-HANDOFF
├─ prompts_v2/                  CONTRACTS TRACK — 00 shared contracts (v2.1.1) + prompts 01–04 + live smoke tests
├─ voice_to_text/               FastAPI wrapper over Whisper (16 kHz WAV in, transcript out); Team 2 source in team2/
├─ body_language/               FastAPI wrapper over Team 3's body-language analysis (frames in, non-scored signals out)
├─ Team3_Body_language/         Team 3's script + models, untouched (imported by body_language/server.py)
├─ production_v2/               EXECUTABLE TRACK — Python runtime + composed prompt pack (reference only, not wired to UI)
├─ legacy_v1/                   v1 prompt pack, kept for reference
├─ AI_Interview_System_Guide_v2.html          guide for the contracts track
├─ AI_Interview_Production_Playbook_v2.html   guide for the executable track
└─ HANDOFF.md                   start here
```

## Two v2 tracks — do not mix payloads

| | `prompts_v2/` (contracts) | `production_v2/` (executable) |
|---|---|---|
| Form | Markdown system instructions with `{{placeholder}}` blocks + one contracts doc | `prompt_pack.json` + Python runtime (validators, routing, SQLite store, tests) |
| Used by | `frontend/src/server/` — **this is what the app runs** | Standalone; different payload shapes |
| Verified | Live trap-chain smoke **33/33** on `gemini-3.5-flash`; full session proven end to end through the UI | 54 unit tests; one synthetic session on `gemini-3.5-flash-lite` |
| Depth | Claim ledger, callbacks, reconciliation, L1–L3 ladders, 31 technique tags, 24 evidence patterns, behavioral-signal firewall | Leaner: topic evaluator, deterministic `route_next`, checkpoint/resume |

Natural path: keep running `prompts_v2` through the app; port `production_v2` runtime ideas (transaction-safe state, checkpoint/resume) as needed.

## Key concepts

- **Three-layer model** — detection is mechanical (backend ledger checks), classification belongs to 03, delivery belongs to 02. 02 never invents a probe while a directive exists.
- **Claim ledger** — `CL{n}` from answers, `R{n}` from the resume: entity, attribute, value, ownership asserted vs demonstrated, verification status. Deterministic checks for value mismatch, ownership drift, timeline order, scale arithmetic, resume mismatch, unanchored metrics.
- **Probe budget & escalation** — base 1/2/3 by `pressure_level`, +1 on pattern weight, hard cap 3/4/4, de-escalation on strong evidence or candid signals. Invisible to the candidate.
- **Difficulty ladders** — L1 → L2 → L3 per critical competency; report "demonstrated up to Lx vs bar Ly".
- **Evidence-quality patterns** B01–B24 — reasons to probe, never score reductions. Honest limits (`honest_down_scope`) are credited.
- **Pressure level** — calm | standard | intense changes quantity and pace, never tone, rubric or fairness.
- **Behavioral signals** — Team 3's gaze/posture/movement measurements → `behavioral_signals/1.0` envelope → backend fusion against the candidate's own warm-up baseline → `attention_flags` to 02 only. **Never a score input**; 03/04 never see them; the report shows counts and flags only.

Source of truth for every field, enum, quota and script: [`prompts_v2/00_shared_contracts.md`](prompts_v2/00_shared_contracts.md).

## Non-negotiables

- Model output is advisory data. Every response is validated against a strict schema; the backend owns state, time, budgets and quotas.
- Only `candidate_message` inside the allow-listed DTO reaches the candidate. No scores, notes, flags, rubric, ledger or recommendation on the candidate channel.
- Untrusted text (JD, resume, portfolio, answers) stays inside tagged data blocks; instructions found there are never followed.
- No protected or personal traits are asked, inferred, stored or used. Style, fluency, grammar, "we" vs "I", pauses and pace are never scored.
- Accommodation requests are granted immediately without asking why. Distress or a stop request ends the session and escalates to a human.
- 04 runs only on a closed session; a human makes every consequential decision.
- `GEMINI_API_KEY` lives only in `frontend/.env.local` / server environment — never in HTML, notebook outputs or the client bundle.

## Quality gates

```bash
cd frontend
npm run check     # tsc + eslint + unit tests (state machine, DTO whitelist, mock engine, redaction, budget rules)
npm run build
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run e2e   # against a MOCK-mode dev server only
```

CI: [`.github/workflows/frontend-ci.yml`](.github/workflows/frontend-ci.yml) — typecheck, lint, format, unit + coverage, e2e on mock, Docker build.

## Docs

| Doc | Read it for |
|---|---|
| [HANDOFF.md](HANDOFF.md) | State of the project, run steps, gaps in priority order, ownership |
| [frontend/docs/RUNBOOK.md](frontend/docs/RUNBOOK.md) | Keys, startup, per-answer flow, code map of `src/server/`, troubleshooting |
| [frontend/docs/ARCHITECTURE.md](frontend/docs/ARCHITECTURE.md) | Directory map, UI state machine, the 8 UI invariants |
| [frontend/docs/api-contract.md](frontend/docs/api-contract.md) | HTTP contract between UI and backend |
| [frontend/docs/FRONTEND-HANDOFF.md](frontend/docs/FRONTEND-HANDOFF.md) | Studio, recordings and workspace features and their caveats |
| [prompts_v2/tests/README.md](prompts_v2/tests/README.md) | Prompt-level live smoke test |
