# Team1_UI-LLM

Team 1 — UI + LLM layer of the PGA12 interview evaluator. Frontend in `frontend/`, prompt packs in `prompts_v2/` and `production_v2/`, speech-to-text prototype in `voice_to_text/`. **New here? Read [HANDOFF.md](HANDOFF.md) first** (state, run steps, gaps, ownership).

# AI Interview Taker — LLM layer

Gemini-driven interviewer that plans, conducts, scores and reports a job interview from a job description and a resume. Built to be **hard to fake, never unfair**: it drills to artifacts, isolates ownership, interrogates every metric, mutates constraints, calls back to earlier statements and finds the candidate's knowledge ceiling — in a neutral, no-praise register, with fairness guardrails on every technique. Body-language / fumble / hesitation models built by other teammates feed the interviewer only as non-scored attention flags.

## Repository map

```
interview taker/
├─ README.md                                  ← this file (index)
│
├─ prompts_v2/                                ← CONTRACTS TRACK (Markdown system instructions)
│  ├─ 00_shared_contracts.md                  ← single source of truth: enums, JSON skeletons, quotas, lexicons, scripts (contracts_version 2.1.1)
│  ├─ 01_interview_blueprint.md               ← Prompt 01: blueprint with ladders, verification kits, callbacks, cases
│  ├─ 02_live_interviewer.md                  ← Prompt 02: live cross-examination interviewer (S0–S9 decision procedure)
│  ├─ 03_answer_evaluator.md                  ← Prompt 03: anchored scoring, claim ledger extraction, pattern taxonomy, ranked directives
│  ├─ 04_final_assessment.md                  ← Prompt 04: weighted report, ceiling vs bar, ledger resolution, non-scored behavioral block
│  └─ tests/                                  ← smoke_v2.py live trap-chain test + evidence/ (33/33 on gemini-3.5-flash)
├─ AI_Interview_System_Guide_v2.html          ← guide for the contracts track (recruiters · developers · ML teammates)
│
├─ frontend/                                  ← FRONTEND (Next.js 16): candidate interview app /i/[token] + recruiter console /console
│  ├─ src/features/interview · console        candidate + reviewer surfaces; src/lib/api/schemas = zod contracts (7-key DTO, strict)
│  ├─ src/mock/                               in-app mock BFF (scripted trap chain) until the real backend exists
│  └─ docs/ARCHITECTURE.md · api-contract.md  code map + the API the backend implements
│
├─ production_v2/                             ← EXECUTABLE TRACK (Python runtime + composed prompt pack, live-tested on Gemini)
│  ├─ prompt_pack.json · runtime.py · run_session.py · live_tests.py · test_*.py · reports/ · README.md
├─ AI_Interview_Production_Playbook_v2.html   ← guide for the executable track
│
├─ legacy_v1/                                 ← v1 pack kept for reference (prompts/, README_v1.md, v1 HTML/DOCX guide)
├─ test.ipynb                                 ← scratch notebook for the Gemini SDK
└─ .env (git-ignored) · .gitignore
```

### Frontend + real BFF

`frontend/` is the production UI for both surfaces **and** hosts the real backend (`/api/v1`): Gemini via `prompts_v2`, Whisper via `voice_to_text/server.py`. **Setup, API key location and run steps: [frontend/docs/RUNBOOK.md](frontend/docs/RUNBOOK.md).**

 `cd frontend && npm install && npm run dev` → demo interview at `/i/demo`, console at `/console` (mock mode; see `frontend/README.md`). It talks to a BFF described in `frontend/docs/api-contract.md`; switch `NEXT_PUBLIC_API_MODE=real` once that service exists. Quality gates: typecheck, lint, 23 unit tests, 7 Playwright e2e, Docker build (`.github/workflows/frontend-ci.yml`).

## Two v2 tracks — read this first

| | `prompts_v2/` — contracts track | `production_v2/` — executable track |
|---|---|---|
| What it is | Five Markdown files: one contracts document + four Gemini system instructions with `{{placeholder}}` blocks. | A composed `prompt_pack.json` (4 prompts, 8 schemas, fixtures) plus a Python library: validators, routing, SQLite session store, Gemini transport, tests. |
| Guide | `AI_Interview_System_Guide_v2.html` | `AI_Interview_Production_Playbook_v2.html` |
| Verification so far | Multi-lens audit (fairness, red-team bluffer, Gemini-execution, cross-file consistency) and reconcile at `contracts_version 2.1.1`. Live smoke test of the 02 → 03 → 02 trap chain: **33/33 on `gemini-3.5-flash`** (`prompts_v2/tests/`). No full-session runtime yet. | 54 unit tests passing; a full synthetic session passed on `gemini-3.5-flash-lite`; adversarial live suites partially blocked by 429/503 quota (see `production_v2/reports/validation-summary.json`). |
| Depth of mechanism | Richer: claim ledger with deterministic drift checks, callback queue, reconciliation turns, L1–L3 ladders, 31 technique tags (incl. NONE), 24 evidence-quality patterns, requisition/candidate two-call blueprint, formal `behavioral_signals` envelope + fusion rules. | Leaner, runnable now: topic evaluator, deterministic `route_next`, probe/reframe limits, transaction-safe state, checkpoint/resume. |
| Payload compatibility | **Different shapes. Do not mix payloads between tracks.** | |

Both tracks share the non-negotiables below. Choosing or merging them is a product decision; the natural path is to run `production_v2` now and port `prompts_v2` mechanisms (ledger, callbacks, ladders, pattern taxonomy, behavioral firewall) into it incrementally, prompt by prompt, with the executable tests as the gate.

## The flow (contracts track)

1. **01 blueprint** — once per requisition (`mode: requisition`, no resume) and once per candidate (`mode: candidate`, adds resume claims and callback pairs), or a single pass with `mode: null`. Validate; seed the callback queue and ladder state.
2. **Opening disclosure** — a fixed script rendered by the backend, not a model call.
3. **02 live turn** — send the full `session_state`; lint `candidate_message`; apply only permitted `recommended_state_update` fields; render the 7-key `candidate_turn_dto`.
4. **03 evaluator** — after every accepted answer; merge `claims_extracted` / `ledger_updates`; recompute probe budget and escalation from `pattern_flags` and `evidence_grade`; queue callbacks; next turn (or fast path when the rank-1 directive needs no state).
5. Repeat until `time_pressure_mode == reserve` → candidate questions → fixed closing.
6. **04 report** — post-close only; inject the non-scored behavioral block after validation; a human records the decision.

## Key v2 concepts

- **Three-layer model** — detection is mechanical (backend ledger checks), classification is 03's, delivery is 02's. 02 never invents a probe while a directive exists.
- **Claim ledger** — `CL{n}` (from answers) and `R{n}` (from the resume) with entity, attribute, value, ownership asserted vs demonstrated, verification status; deterministic checks for value mismatch, ownership drift, timeline order, scale arithmetic, resume mismatch, unanchored metrics.
- **Probe budget & escalation** — base 1/2/3 by `pressure_level`, +1 content escalation on pattern weight, hard cap 3/4/4, interview pool, de-escalation on strong evidence or candid signals; time modes override budget. Invisible to the candidate.
- **Difficulty ladder** — L1 → L2 → L3 per critical competency (`is_must_have OR weight >= 15`); one reframe per rung; report "demonstrated up to Lx vs bar Ly".
- **Technique tags** — DRILL, SPECIFIC, REPLAY, ANCHOR, OWN, COUNTERFACTUAL, HANDOFF, NEGSPACE, REFSIM, FRICTION, RESOURCE, TIMELINE, METRIC, DISCONFIRM, MUTATE, ALT, PREMISE, FAIL, CALLBACK, RECONCILE, LADDER, TEACHBACK, PROVENANCE, LIVE_VARIANT, ESTIMATE, COMMIT, PIN, TENSION, REVEAL, REFRAME, NONE — each with a guardrail.
- **Evidence-quality patterns** B01–B24 and **candid signals** — patterns are reasons to probe, never score reductions; honest limits are rewarded.
- **Evaluator directives** — up to 3 ranked probes from 03 with `suggested_wording` that may reach the candidate verbatim.
- **Pressure level** — calm | standard | intense; a requisition property with a written rationale for `intense`; changes quantity and pace, never tone, rubric or fairness.
- **Behavioral signals** — ML envelope → backend fusion against the candidate's own warm-up baseline → reduced `attention_flags` to 02 only; may re-order equally ranked directives or license a rephrase offer; **never a score input**; 03/04 never receive them; report shows a separate non-scored block.

## Input contract (`interview_input/2.0`, backend → 01)

```json
{
  "schema_version": "interview_input/2.0",
  "requisition_id": "string", "session_id": "string",
  "mode": "requisition | candidate | null",
  "effective_duration_minutes": "integer | null",
  "job_title": "string", "field": "string", "field_family": "software | data_analytics_ds | finance_accounting | sales_marketing | operations_supply | people_hr | general_business | null",
  "seniority": "intern | junior | mid | senior | lead | manager", "employment_type": "string | null",
  "location_or_market": "string | null",
  "interview_language": "BCP-47 string", "duration_minutes": "integer (20-90)",
  "interview_style": "technical | case | behavioral | mixed", "interview_modality": "voice | text | both",
  "interview_purpose": "hiring | mock_practice",
  "pressure_level": "calm | standard | intense", "pressure_rationale": "string | null (required when intense)",
  "job_description": "verbatim, untrusted",
  "must_have_skills": ["string"], "nice_to_have_skills": ["string"],
  "candidate_resume": "redacted verbatim | null (requisition mode)", "resume_redaction_applied": true,
  "candidate_portfolio_or_context": "string | null", "company_context": "string | null", "interviewer_constraints": "string | null",
  "accommodation_notes": {"codes": ["accommodation_code"], "operational_note": "string | null", "behavioral_analysis_consent": true, "timing_triggers_disabled": false},
  "consent": {"ai_interview_notice_ack": true, "recording_consent": true, "notice_version": "string"}
}
```

Full skeletons, enums and rules: `prompts_v2/00_shared_contracts.md`.

## Gemini settings (contracts track; from the prompt files)

| Prompt | temperature | thinking | maxOutputTokens | notes |
|---|---|---|---|---|
| 01 blueprint | 0.2 (topP 0.95) | 4k–8k | 32000 | strict `responseSchema`, `nullable` only on listed paths, full `propertyOrdering` |
| 02 live turn | 0.2–0.3 | 512–1024 | ≥ thinking + 1200 (2200) | `candidate_message` first; on MAX_TOKENS retry once with thinking 0 |
| 03 evaluator | 0.1–0.2 | 2048 | 8192 | key order = emission order; array caps as `maxItems` |
| 04 report | 0.1 | high | 20000 (32000 if thoughts count) | `candidateCount: 1`; halve size caps on MAX_TOKENS |

Same `model_id` for every call in a session; pin prompt versions, `contracts_version`, model, signal-schema and fusion versions in a per-session version bundle.

## Operational rules (both tracks)

- Model output is advisory data. Validate every response against a strict schema; the backend owns state, time, budgets and quotas.
- Only `candidate_message` (inside the allowlisted DTO) ever reaches the candidate. No scores, notes, flags, rubric, ledger or recommendation on the candidate channel.
- Untrusted data stays inside tagged data blocks; instructions found in JD, resume, portfolio or answers are never followed.
- No protected or personal traits are asked, inferred, stored or used; style, fluency, grammar, register, "we" vs "I", pauses and pace are never scored.
- Accommodation requests are granted immediately without asking why; distress or a stop request ends the session politely and escalates to a human.
- Behavioral signals never enter any score, finding or recommendation.
- 04 runs only on a closed session; a human makes every consequential decision and records it separately from the model's label.
- Keep `GEMINI_API_KEY` in `.env` / server environment only. Never in HTML, notebooks' saved outputs, or the client bundle.

## What changed from v1

- Flat two-probe cap → budget, escalation, pool and time modes.
- Transcript-only memory → claim ledger, callbacks, reconciliation.
- Fixed question list → per-competency L1–L3 ladders and a knowledge ceiling.
- Interviewer-decided probes → evaluator directives + backend rules + interviewer delivery.
- "Concise, professional" persona → linted deposition register with allowed/banned lexicons.
- Ad-hoc "shallow signals" → 24 named evidence-quality patterns with guardrails, plus candid signals.
- Software-only examples → domain translation across seven field families.
- Per-field placeholders → one serialized JSON object per prompt.
- No ML story → formal `behavioral_signals` contract, fusion rules and a firewall.
- Prose contracts → `00_shared_contracts.md` with CI consistency checks.

## Housekeeping notes

- `legacy_v1/` holds the v1 prompts and guide; do not use them in new sessions.
- Two items may still sit at the repository root until VS Code / Word release their locks: an empty `prompts/` directory (contents already in `legacy_v1/prompts/`) and `AI_Interview_Prompt_System_Guide.docx` (destination `legacy_v1/`).

### Interviewly workspace refinement

The frontend now includes a practice dashboard, resume setup, a live interview studio with screen sharing and local session recording, and a recording library. Start at `/`. See [frontend/docs/FRONTEND-HANDOFF.md](frontend/docs/FRONTEND-HANDOFF.md) for what is implemented, the new session-creation endpoint, recording behavior, and the remaining Gemini/team-service integration.


