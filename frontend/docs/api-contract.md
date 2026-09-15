# Frontend ↔ BFF API contract

Authoritative TypeScript/zod definitions: `src/lib/api/schemas/candidate.ts` and `src/lib/api/schemas/console.ts`. Field names follow `prompts_v2/00_shared_contracts.md`. This document is the human-readable summary the backend team implements against. The in-app mock (`src/mock/handlers.ts`) is a working reference implementation.

Conventions: JSON bodies; `Idempotency-Key` header on every POST that mutates; errors are `{ code, message, details? }` with an HTTP status; `429`/`5xx` are retried by the client with backoff; every response is validated — unknown extra keys on the candidate DTO fail closed.

## Candidate channel — `/candidate/sessions/{token}`

Scoped by the invite token. No cookies, no session id chosen by the browser.

| Method | Path                          | Body                                                                                                | Returns                                                                                                  |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/candidate/sessions/{token}` | —                                                                                                   | `CandidateSessionView`                                                                                   |
| POST   | `…/consent`                   | `{ ai_interview_notice_ack: true, recording_consent, behavioral_analysis_consent, notice_version }` | `CandidateSessionView` (status → `device_check`)                                                         |
| POST   | `…/device-ready`              | `{ camera: boolean, microphone: boolean }`                                                          | `CandidateSessionView` (status → `ready`)                                                                |
| POST   | `…/start`                     | —                                                                                                   | view with the first `current_turn`; backend renders the disclosure and sets `candidate_rights_disclosed` |
| POST   | `…/answers`                   | `{ turn_index, text, media_ref, client_elapsed_ms, auto_submitted }`                                | view (status `evaluating` until the next turn is ready); stale `turn_index` → current view, no re-apply  |
| POST   | `…/requests`                  | `{ type: repeat\|rephrase\|break\|resume\|stop }` or `{ type: "adjustment", code }`                 | view                                                                                                     |
| POST   | `…/media`                     | multipart: `turn_index`, `sequence`, `chunk` (audio/webm)                                           | `{ media_ref, received_bytes }`                                                                          |
| GET    | `…/review`                    | —                                                                                                   | `PracticeReview` (`lib/api/schemas/review.ts`); 403 `not_practice` for hiring sessions, 409 `not_finished` until closed/escalated; first call runs Prompt 04 |
| POST   | `…/frames`                    | multipart: `turn_index`, `frames[]` (JPEG ≤ 400 KB each, ≤ 16, filename `<t_ms>.jpg`) — one batch per second while answering | `{ accepted, detected, service_reachable }`; **204** when capture is off (no behavioral consent, camera off, any accommodation, no open answer) — the browser stops sending |
| GET    | `…/events`                    | —                                                                                                   | `text/event-stream`; frames `{type: "turn" or "status", session}` and `{type: "heartbeat", at}`          |

### `CandidateSessionView`

```json
{
  "session_id": "S_…",
  "status": "awaiting_consent|device_check|ready|disclosed|active|paused|evaluating|candidate_questions|closed|escalated",
  "interview_language": "en-IN",
  "interview_modality": "voice|text|both",
  "job_title": "…",
  "company_display_name": "…",
  "duration_minutes": 45,
  "opening_disclosure": "string|null",
  "consent": {
    "ai_interview_notice_ack": true,
    "recording_consent": true,
    "behavioral_analysis_consent": false,
    "notice_version": "2026-03"
  },
  "accommodations_applied": ["text_modality"],
  "current_turn": {
    "turn_index": 4,
    "turn_type": "main_question|follow_up|candidate_questions|closing",
    "candidate_message": "…",
    "requires_answer": true,
    "max_answer_seconds": 180,
    "can_request_clarification": false,
    "phase_label": "interview|your_questions|closing"
  },
  "elapsed_seconds": 512
}
```

`current_turn` is exactly the 7-key `candidate_turn_dto` from `00 §17`. Anything else on it is rejected client-side.

## Console channel — `/console/*` (cookie `console_session`)

| Method    | Path                                      | Body                                       | Returns                                                                                                                       |
| --------- | ----------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| POST      | `/console/login`                          | `{ email, password }`                      | `ConsoleUser`; sets HttpOnly cookie                                                                                           |
| POST      | `/console/logout`                         | —                                          | `{ ok: true }`                                                                                                                |
| GET       | `/console/me`                             | —                                          | `ConsoleUser \| null`                                                                                                         |
| GET       | `/console/requisitions`                   | —                                          | `{ items: Requisition[], total }`                                                                                             |
| POST      | `/console/requisitions`                   | `RequisitionInput`                         | `Requisition` (201)                                                                                                           |
| GET / PUT | `/console/requisitions/{id}`              | `RequisitionInput` on PUT                  | `Requisition`                                                                                                                 |
| POST      | `/console/requisitions/{id}/blueprint`    | —                                          | `Requisition` with `blueprint` (runs Prompt 01, requisition mode; validated)                                                  |
| POST      | `/console/requisitions/{id}/freeze`       | —                                          | `Requisition` (`status: frozen`); 409 if validation failed                                                                    |
| POST      | `/console/requisitions/{id}/invites`      | `{ candidate_label, interview_language? }` | `{ session_id, invite_token, invite_url }`; 409 unless frozen                                                                 |
| GET       | `/console/sessions?requisition_id&status` | —                                          | `{ items: SessionSummary[], total }`                                                                                          |
| GET       | `/console/sessions/{id}`                  | —                                          | `SessionDetail` (summary, transcript, evaluations, budget_audit, accommodations, report, human_decision, version_bundle)      |
| POST      | `/console/sessions/{id}/report`           | —                                          | `FinalReport`; 409 unless closed/escalated (runs Prompt 04; backend injects `non_scored_behavioral_context` after validation) |
| POST      | `/console/sessions/{id}/decision`         | `{ decision, reason }`                     | `HumanDecision`; 409 without a report                                                                                         |
| GET       | `/console/audit?session_id`               | —                                          | `{ items: AuditEvent[], total }`                                                                                              |

### `RequisitionInput`

Mirrors `interview_input` (`00 §3`) minus backend-owned fields: `job_title, field, field_family|null, seniority, employment_type|null, location_or_market|null, interview_language, duration_minutes (20–90), interview_style, interview_modality, interview_purpose, pressure_level, pressure_rationale|null (required when intense), job_description (≥50 chars), must_have_skills[1..12], nice_to_have_skills[0..12], company_context|null, interviewer_constraints|null`.

### `FinalReport`

The Prompt 04 shape as consumed by the console: `evidence_coverage`, `competency_assessment[]`, `overall_weighted_score|null`, `knowledge_ceiling_summary[]`, `claim_ledger_resolution[]`, `metric_table[]`, `ownership_profile`, `pattern_summary[]`, `candid_signals_summary[]`, `consistency_notes[]`, `pressure_response_summary`, `demonstrated_strengths[]`, `material_gaps_or_risks[]`, `unverified_claims[]`, `recommendation`, `recommendation_rationale`, `recommended_next_step`, `human_reviewer_notes[]`, `coverage_limitations[]`, `candidate_feedback|null`, `non_scored_behavioral_context|null`. See the zod schema for every field and enum.

## Security expectations on the BFF

- Candidate channel: token-scoped; rate-limited; `candidate_turn_dto` built by an allowlist serializer (exactly seven keys); no hidden field ever serialized on this channel.
- Console channel: authenticated; role-checked (`recruiter | reviewer | admin`); every guard violation, state-update rejection, budget decision, escalation, consent and human decision written to the audit log.
- Behavioral firewall: 03/04 payload builders have no code path to the behavioral store; `non_scored_behavioral_context` injected post-validation only.
- Media: chunks stored per `session_id + answer_id` in a separate store with shorter retention; never joined to scores in exports.
