# Executable interview prompt system

This package matches `AI_Interview_Production_Playbook_v2.html`. It does not use the separate `prompts_v2/` Markdown contracts, which are a different design. Do not mix payloads between them.

## Included

- `prompt_pack.json`: four composed prompts, eight schemas, synthetic fixtures, policy and hashes.
- `runtime.py`: actual structural/semantic validators, scoring, deterministic routing, tenant-scoped SQLite transactions, idempotent event handling, report persistence and bounded Gemini transport.
- `test_runtime.py`, `test_provider.py` and `test_session.py`: automated runtime, mocked provider and interrupted-session recovery tests.
- `live_tests.py`: bounded live synthetic smoke/adversarial tests; saves accepted outputs and failure codes.
- `run_session.py`: real Gemini interviewer/evaluator/report calls in a complete scripted synthetic session over a frozen fixture blueprint. The live planner is tested separately.
- `model_config.json`: selected model configuration, never a secret key.
- `requirements.lock`: pinned dependencies for reproducible installation.
- `reports/`: synthetic test evidence. No real candidate data is required.

## Setup

Use Python 3.10 or newer. From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m unittest discover -v -p "test_*.py"
```

For Gemini, set `GEMINI_API_KEY` in the server environment or keep it in the parent project's `.env`. This package reads the key privately. Never paste it into an HTML file, commit it, or expose it to a browser.

```powershell
.\.venv\Scripts\python.exe live_tests.py --suite smoke --model gemini-3.5-flash-lite
.\.venv\Scripts\python.exe live_tests.py --suite adversarial --model gemini-3.5-flash-lite --workers 1
.\.venv\Scripts\python.exe run_session.py --model gemini-3.5-flash-lite --local-delivery
```

The complete synthetic session passed on `gemini-3.5-flash-lite`, with 5 main topics and 7 provider calls. The account also exposes `gemini-3.8-flash`, but testing encountered transient 503 and daily-quota 429 errors. A four-stage smoke test passed on `gemini-3.5-flash`. These results are model-specific. Daily free quotas may need to reset or be increased by the account owner before more live runs. This package never changes billing or silently switches models mid-session.

`--local-delivery` displays already approved main/probe/reframe text and supported fixed English scripts directly, using the same output validation. Gemini remains responsible for adaptive evaluation and final narrative. Complex company FAQ answers or unsupported fixed-script languages still route to Gemini. This removes redundant calls without letting the candidate change the approved text.

## Integrating your application

1. Authenticate the caller and derive tenant/session ownership from server context, not from candidate-submitted JSON. This package is a library, not a public HTTP service or an authentication framework.
2. Use `validate_input(pack, stage, payload)` before provider calls. `GeminiClient.call` already performs this check and validates output afterward.
3. `provider_schema` removes constraints rejected by the provider's generation schema. Full bounds and unknown-field rejection remain enforced by the original backend schema. Never substitute the reduced schema for server validation.
   Structural/reference output failures get at most one regeneration using backend-authored validation feedback, not an attempt to obtain a preferred score. Daily quota errors stop retries and open the live-test circuit breaker; pending cases are explicitly skipped.
4. Use `SessionStore.transition` with expected revision and a unique event ID. Counter changes and the emitted-turn result belong to the same transaction. Reusing an event ID with different contents is rejected.
5. Derive the next mode through `route_next`, respecting stop, pause, time, transcription repair, reframe and probe limits. Close the old topic explicitly before selecting the next.
6. For each main question save only the latest accepted assessable cumulative revision for final scoring. Keep older revisions in your audit record; do not average them as independent observations.
7. Display only a public DTO assembled explicitly from the validated `candidate_message`, `expected_input` and backend turn ID. Use plain-text rendering. Never return the raw pack, evaluator output or API key to a candidate.
8. Freeze the closed session, compute metrics, generate the final report, and save a report revision. Authorized human reviewers decide consequential actions.

SQLite persistence is suitable for a local process/integration harness and supports the tested transaction races. For horizontally scaled production, port these transaction semantics to your managed database and test that deployment. Files are not application-level encrypted by this library; production storage/access/retention belongs to the deployment owner.

## Test interpretation

All saved live cases use synthetic source text and answers. Passing schema/behavior assertions demonstrates those particular executions, not statistical hiring validity. Domain-expert anchor calibration, candidate accessibility/usability, your web application's authentication and regional data-handling requirements remain separate release gates.

Live reports retain failed attempts as well as successes. Read the timestamp, model, input/prompt version and case count rather than treating any single report filename as universal proof. Earlier development reports record the schema version but not exact prompt hashes; they are historical behavior observations, not reproducible proof for the final prompt revision. New calls record the actual system-instruction hash, including any validation feedback. The final HTML and `reports/validation-summary.json` contain the consolidated status.

The synthetic runner checkpoints the pending stage/input and accepted evidence before each call; session events/answers persist in SQLite. A failed run is not automatically marked complete. After quota recovery, resume a current checkpoint with:

```powershell
.\.venv\Scripts\python.exe run_session.py --resume reports/checkpoint-YOUR-SESSION-ID.json
```

The model and prompt hashes must match the saved run. Accepted outputs are replayed through validation and idempotent event storage, without new provider calls for those steps. Completed checkpoints return their report immediately. Older development checkpoints without version hashes cannot resume safely and are rejected. Completed runs also have a final report artifact.
