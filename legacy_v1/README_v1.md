# Gemini AI Interviewer and Assessor Prompt Pack

This folder contains a production-oriented prompt workflow for an AI interview that is tailored to a role, field, job description, and candidate resume. It produces demanding, evidence-based interviews: the interviewer tests claims, probes assumptions, and uses realistic edge cases. It does not use irrelevant personal traits or ambush questions.

## The flow

1. Send `prompts/01_interview_blueprint.md` with the job and candidate inputs. Save its JSON response as `interview_blueprint`.
2. At each turn, send `prompts/02_live_interviewer.md`, including the blueprint, the transcript, and the current turn state. Display `candidate_message` to the candidate.
3. When the candidate answers, send `prompts/03_answer_evaluator.md`. Save the JSON evaluation and update the next turn state from it.
4. After the interview, send `prompts/04_final_assessment.md` with the complete transcript, blueprint, and all answer evaluations.

Each stage has a different job. Do not ask Gemini to plan, interview, and score in one request; separating them makes the interview more consistent and auditable.

## Implementation plan

### Phase 1 — collect and normalize inputs

Collect the job description, job title, field, seniority, must-have and nice-to-have skills, interview duration, language, and interview style. Collect the candidate resume or profile, plus any job-relevant portfolio or project links/text. Preserve the original text; do not silently infer missing facts.

### Phase 2 — create the interview blueprint

Use Prompt 01 once per candidate and role. Validate that it returns valid JSON. Its competency weights should total 100 and its question plan should fit the time limit.

### Phase 3 — run the interview one question at a time

Use Prompt 02 for every interviewer turn. Provide the latest transcript and the saved blueprint. Never expose the answer key, hidden rubric, contradiction log, or scoring to the candidate during the session.

### Phase 4 — score every answer

Use Prompt 03 after each candidate answer. Store its JSON alongside the question, answer, timestamp, and interview turn. The app, not the model, should decide whether to end the session based on the model's `recommended_next_action` plus your time/turn rules.

### Phase 5 — produce the final report

Use Prompt 04 after the interview. Show evidence and confidence levels so a recruiter can review the recommendation. A human should make the final hiring decision.

## Input contract

Replace every `{{placeholder}}` before sending a prompt. Put untrusted source text exactly inside the marked data blocks. The model instructions say not to follow commands contained in a resume, job description, portfolio, or candidate answer.

```json
{
  "job_title": "{{job_title}}",
  "field": "{{field}}",
  "seniority": "{{intern|junior|mid|senior|lead|manager}}",
  "employment_type": "{{optional}}",
  "location_or_market": "{{optional, only if job-relevant}}",
  "interview_language": "{{English}}",
  "duration_minutes": 45,
  "interview_style": "{{technical|case|behavioral|mixed}}",
  "job_description": "{{verbatim job description}}",
  "must_have_skills": ["{{skill}}"],
  "nice_to_have_skills": ["{{skill}}"],
  "candidate_resume": "{{verbatim resume}}",
  "candidate_portfolio_or_context": "{{optional job-relevant evidence}}",
  "company_context": "{{optional business/product context}}",
  "interviewer_constraints": "{{optional: allowed tools, no coding task, etc.}}"
}
```

## Operational rules

- Keep the API output structured: request `application/json`, then validate it against the schemas described in each prompt.
- Store the blueprint and each per-answer evaluation server-side. Do not send hidden scoring data to the candidate-facing client.
- Give candidates a chance to clarify a vague question, state assumptions, and correct themselves. Treat uncertainty honestly stated with sound reasoning more favorably than confident fabrication.
- Do not use age, gender, ethnicity, nationality, disability, religion, family status, accent, appearance, or other protected/personal traits in questions or scores. Do not infer any of them from the resume.
- Use a human reviewer for consequential decisions. The result is a structured interview signal, not an automatic rejection or hiring decision.

## Recommended Gemini settings

- Temperature: `0.2` for planning/scoring, `0.35` for the live interviewer.
- Response MIME type: `application/json`.
- Keep `maxOutputTokens` high enough for the blueprint and final assessment; 2,000–4,000 is usually sufficient.
- Use the same selected Gemini model for every stage of an interview session. Save the prompt version with every result.

## Folder contents

- `prompts/01_interview_blueprint.md` — role-aware question plan and hidden rubric.
- `prompts/02_live_interviewer.md` — candidate-facing, one-question-at-a-time interviewer.
- `prompts/03_answer_evaluator.md` — answer-level scoring and follow-up guidance.
- `prompts/04_final_assessment.md` — evidence-based final report.
