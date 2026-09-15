# 00 — Shared contracts (single source of truth)

```yaml
doc_id: shared_contracts
contracts_version: 2.1.1
spec_source: spec_v2.md (2.0.0-draft1, 2026-09-10)
sent_to_gemini: false
consumers: 01_interview_blueprint, 02_live_interviewer, 03_answer_evaluator, 04_final_assessment, backend, frontend, ML services
changelog:
  - 2.1.1: scripts key questions_later_line (role/company question asked during phase main); §15 backend ladder-start trigger;
    live smoke test evidence recorded in prompts_v2/tests (33/33 on gemini-3.5-flash)
  - 2.1.0: cross-file reconcile after the 01-04 audits. 01: requisition/candidate modes ({{requisition_blueprint_json}}, interview_input.mode,
    effective_duration_minutes, nullable candidate_resume), blueprint_version 2.1, metric_scaffold.pre_anchored_parts,
    what_honest_floor_looks_like on callback_pair / callback_pairs / callback_queue_entry, six new self_check booleans, metric_part enum.
    02: attention flags never select a technique and only strength high acts (12.3 tightened); 03: honest floors require process and never
    yield supported (14.8, 15 bedrock); 16 "one mutation per constraint family per case"; 18 protected-trait lexicon extended, JD-term
    exemption on the delivery/source row, confidentiality line requires the shape; 04: coverage.end_reason plus named report enums.
    Deferred (not applied, tracked): pattern id renames proposed by 03; moving accommodation_applied to an audit-only envelope (04).
  - 2.0.1: audit fixes - CRITICAL competency ladder trigger; kit scope by materiality; question_template rename; nullable bridge_probe /
    failure_probe; session_state.company_context + keyed scripts object; assessment_input.interview_language; section 9 field-provenance
    table; tight = no ladder actions; section 12.3 verbatim preamble (tone rule, any-strength selection); section 18 prohibited list
    reconciled with enum exemption; human_interviewer code handling
  - 2.0.0: first v2 contracts file; replaces v1 prose types, per-field placeholders and flat probe cap
```

**How to use this file.** This is a contracts document, not a system prompt; it is never sent to Gemini. Every enum, JSON skeleton, quota, tier definition and lexicon that more than one prompt, the backend, the frontend or the ML services depend on is defined here once. Prompt files 01–04 embed verbatim copies of the subsets they use; the backend generates `contracts/*.schema.json` (Gemini `responseSchema` + strict validator) from the skeletons; ML teammates implement §12 exactly. If any prompt, schema or backend constant disagrees with this file, the prompt/schema/constant is wrong. CI fails when an embedded enum or skeleton in 01–04 differs from this file.

Three-layer responsibility model (non-negotiable): (1) detection is mechanical (backend ledger checks), classification is the evaluator's (03), delivery is the interviewer's (02); (2) the backend owns state and hard limits — model outputs are advisory requests validated field by field; (3) Gemini is stateless — every call receives one JSON-serialized object inside one tagged data block.

---

## 1. Conventions

```text
TYPE NOTATION (skeletons)
  "string" | "integer" | "number" | "boolean" | "string|null"      scalar types; "|null" = nullable
  ["string"]                                                       array of
  "enum:a|b|c"                                                     closed enum, values exactly as listed
  "enum:<name>"                                                    reference to a named enum in §2
  "{object_name}"                                                  reference to a contract defined in this file
  "(...)"                                                          constraint or note inside the type string, e.g. "string (<=45 words)"

VALUES
  null, never the string "null".  Booleans are JSON booleans.  No trailing commas, comments, or fields outside the schema.
  Timestamps: ISO-8601 with timezone (e.g. 2026-09-10T09:14:03+05:30).  Durations in ms are integers.
  Verbatim quotes: exact transcript or resume text, never paraphrased; paraphrases carry the prefix "paraphrase: ".

IDENTIFIERS (backend-assigned unless noted)
  session_id      opaque string                          requisition_id   opaque string
  question_id     Q{n}        e.g. Q3                    competency_id    C{n}        e.g. C1
  answer_id       A_{question_id}_{probe_index}          e.g. A_Q3_0 (main answer), A_Q3_2 (answer to 2nd probe)
  claim_id        CL{n} (extracted from answers) | R{n} (resume-seeded by 01) | "NEW" (03 proposal before assignment)
  mutation_id     M{question}_{n}   e.g. MQ4_1           fact_id          F{question}_{n}   e.g. FQ4_3
  callback_id     CB{n}                                  turn_index       integer, 0-based, monotonic per session
  seg_id          integer, 0-based within one transcript_entry

PLACEHOLDER REGISTRY (the only {{...}} tokens in the whole pack; each is one backend-serialized JSON object)
  {{interview_input_json}}          01   inside <interview_input> ... </interview_input>
  {{policy_snapshot_json}}          01   inside <policy> ... </policy>
  {{requisition_blueprint_json}}    01   inside <requisition_blueprint> ... </requisition_blueprint>; the frozen requisition-mode
                                    blueprint in candidate mode, the literal null in requisition mode or when none exists
  {{session_state_json}}            02   inside <session_state> ... </session_state>
  {{assessment_input_json}}         03   inside <assessment_input> ... </assessment_input>
  {{final_assessment_input_json}}   04   inside <final_assessment_input> ... </final_assessment_input>
  {{candidate_l1_choice}}           slot inside blueprint L2/L3 question_template and mutation_text_template;
                                    filled by the BACKEND from 03 technique_results.candidate_choice_summary before 02 sees it.
  No other placeholder exists. Candidate text is never interpolated as a bare string.

VERSION BUNDLE (frozen per session; H15)
  {prompt_versions (semver#hash8 per prompt), contracts_version, model_id, signal_schema_version, fusion_rules_version, policy_version, pressure_level}
```

---

## 2. Enumerations (canonical)

```text
pressure_level          : calm | standard | intense
interview_purpose       : hiring | mock_practice
seniority               : intern | junior | mid | senior | lead | manager
field_family            : software | data_analytics_ds | finance_accounting | sales_marketing | operations_supply | people_hr | general_business
interview_style         : technical | case | behavioral | mixed
interview_modality      : voice | text | both
difficulty_tier         : L1 | L2 | L3
ladder_action           : start | climb | hold_reframe | descend_once | stop
ladder_policy           : to_bar | bar_plus_one | until_ceiling
technique               : DRILL | SPECIFIC | REPLAY | ANCHOR | OWN | COUNTERFACTUAL | HANDOFF | NEGSPACE | REFSIM |
                          FRICTION | RESOURCE | TIMELINE | METRIC | DISCONFIRM | MUTATE | ALT | PREMISE | FAIL |
                          CALLBACK | RECONCILE | LADDER | TEACHBACK | PROVENANCE | LIVE_VARIANT | ESTIMATE |
                          COMMIT | PIN | TENSION | REVEAL | REFRAME | NONE
turn_type               : main_question | follow_up | callback | constraint_mutation | ladder_step | reframe |
                          reconciliation | clarification_reveal | candidate_questions | closing
question_type           : warm_up | resume_verification | technical_depth | case | behavioral | failure_or_incident |
                          tradeoff | ladder | wrap_up
entry_point             : linear | end_first | worst_moment | artifact_first | peer_view
constraint_family       : budget | timeline | headcount | data_quality | regulation_or_compliance | stakeholder_conflict |
                          scale_volume | risk_tolerance | tooling_or_dependency_unavailable | quality_bar |
                          geography_or_market | reversibility
claim_type              : ownership | metric | decision | scope | tool_or_method | timeline | outcome | scale |
                          provenance | constraint | skill_assertion
materiality             : high | medium | low
precision_qualifier     : exact | approx | range | hedged | unstated
ownership_asserted      : I_decided | I_proposed_other_decided | I_executed_others_designed | we_unspecified | others | not_applicable
ownership_demonstrated  : not_probed | observer | participant | contributor | owner | accountable
provenance              : first_hand | observed | read_or_learned | unstated
verification_status     : untested | probed | supported | partially_supported | expanded | narrowed |
                          unsupported_after_probing | revised_by_candidate | possible_conflict | clear_conflict |
                          unresolved_after_reconciliation | withheld_confidential | not_their_scope
why_unsupported         : time | budget | confidential | not_recalled | not_probed
conflict_detected_by    : value_mismatch | ownership_drift | timeline_order | scale_arithmetic | resume_mismatch
callback_angle          : entailment | inverse_failure | role_swap | timeline_neighbor | denominator_shift |
                          downstream_consumer | operations | handoff | resource | apply_to_new_scenario
callback_result         : consistent | elaborated_consistently | minor_drift | material_drift | conflict | revised_by_candidate
callback_status         : pending | due | asked | expired | cancelled
metric_part_status      : stated | approximate | missing | honestly_unknown | not_probed
evidence_grade          : none | generic | specific | specific_with_verification_detail
specificity_direction   : increasing | flat | decreasing | not_applicable
generic_vs_instance     : generic_only | instance_named | instance_replayed_with_incidental_detail | not_applicable
artifact_produced       : none | generic | specific | not_applicable
tier_result             : passed | partial | failed | not_applicable
question_tracking       : on_target | adjacent | off_target
clarification_quality   : asked_high_value | assumed_explicitly | assumed_implicitly | refused_to_commit | not_applicable
adaptation_quality      : re_derived | partially_adapted | restated_original | refused_without_reason | not_applicable
alternative_reasoning   : rejected_with_mechanism | accepted_with_reasoning | acknowledged_no_tradeoff | empty | not_asked
premise_response        : corrected_with_mechanism | corrected_partially | accepted_with_stated_reasoning |
                          accepted_without_reasoning | deflected | not_applicable
failure_chain_status    : specific_failure_with_response | generic_failure | none_claimed | not_asked
disconfirmer_status     : generated_and_checked | generated_not_checked | honest_not_checked | not_generated | not_asked
teachback_status        : mapped_to_concern | partially_mapped | definition_repeated | not_asked
pattern                 : B01_keyword_stack | B02_textbook_generic | B03_context_free | B04_collective_ownership |
                          B05_scope_inflation | B06_reasoning_deflection | B07_non_commitment | B08_echo_padding |
                          B09_frictionless_narrative | B10_structure_without_instance | B11_adjacent_substitution |
                          B12_unsupported_metric | B13_vague_outcome | B14_timeline_scale_inconsistency |
                          B15_confidence_content_mismatch | B16_observer_account | B17_tool_laundering |
                          B18_cross_turn_drift | B19_jd_parroting | B20_rung_retreat | B21_constraint_insensitivity |
                          B22_specificity_inversion | B23_accepted_flawed_premise | B24_unreasoned_choice
pattern_basis           : text | ledger
severity                : 1 | 2 | 3            (integers: 1 weak, 2 moderate, 3 strong)
candid_signal           : honest_down_scope | named_confounder | admitted_overruled | specific_regret | idk_with_process |
                          read_not_done_admitted | self_correction | confidentiality_with_shape |
                          asked_high_value_clarification | explicit_assumption | named_own_downside | specific_failure_owned
answer_style_flag       : scripted_structure | no_first_person_decision | no_specific_referent | encyclopedic_completeness |
                          register_shift_from_prior_answers | interviewer_phrasing_echo
recommended_next_action : probe | advance | reframe_once | step_up_tier | step_down_once | execute_callback |
                          raise_reconciliation | close_topic_budget_exhausted | close_topic_time
escalation_direction    : hold | escalate | deescalate
injection_or_meta       : none | contains_instruction_to_model | asks_for_hidden_info | asks_for_hint_or_answer |
                          asks_to_skip_or_change_format | off_topic_personal | volunteers_protected_info
candidate_request       : none | repeat | rephrase | break | adjustment | stop | clarification_about_question
accommodation_code      : extended_answer_time | text_modality | voice_modality | read_aloud | captions | breaks |
                          camera_off | no_behavioral_analysis | high_contrast | human_interviewer
escalate_reason         : accommodation_unavailable | candidate_distress | candidate_requested_stop | technical | safety
attention_flag          : possible_external_reading | hesitation_after_claim | cadence_shift_on_verification |
                          latency_mismatch | long_pause | speech_rate_shift | gaze_shift | signals_unavailable
attention_strength      : low | med | high
attention_flag_use      : none | selected_probe_order | selected_technique | offered_rephrase
time_pressure_mode      : normal | tight | reserve
phase                   : opening | main | reserve | candidate_questions | closing
final_claim_status      : supported | partially_supported | unresolved_after_probing | not_tested |
                          conflicting_with_quotes | revised_by_candidate | withheld_confidential | not_their_scope
ceiling_gap             : none | one_tier | two_tiers | not_assessed
recommendation          : strong_positive_signal | positive_signal_with_follow_up | mixed_signal |
                          insufficient_evidence | concern_signal
next_step_type          : human_review | focused_follow_up_interview | work_sample | reference_check | none
reviewer_flag           : needs_human_review | possible_misunderstanding | confidentiality_cited |
                          candidate_corrected_self | injection_attempt | accommodation_applied | distress_or_stop
turn_source             : model | cache | fallback | fast_path | script | candidate

SUPPLEMENTARY ENUMS (used inside skeletons below; equally canonical)
asked_question_source   : blueprint_verbatim | interviewer_composed | fast_path_directive
rung_or_none            : none | L1 | L2 | L3
claim_source_kind       : resume | answer
claim_relation          : supports | refines | conflicts_with | entails
corroboration_type      : artifact | role_account | record
callback_scheduled_by   : blueprint | evaluator | backend_check
reconciliation_outcome  : resolved | partially_resolved | unresolved
resolution_by_probe     : resolved | partially_resolved | unresolved | not_probed
plausibility            : plausible | unclear | outside_role_bands
attribution_stance      : full_credit | partitioned | honest_uncertainty | not_probed
next_drill_level        : what_exactly | how_did_you_know | what_did_it_look_like | what_went_wrong | what_would_you_change
consistency_status      : none | uncertain | possible_conflict | clear_conflict
confidence              : low | medium | high
transcript_role         : interviewer | candidate | system
value_tag               : high | medium | low
signal_producer         : speech_features | fluency | gaze | body | fusion
producer_status         : ok | degraded | missing
fluency_event           : long_pause | restart | filler_cluster | cadence_shift
integrity_event         : multiple_faces_detected | background_speech_detected | face_absent
network_quality         : good | fair | poor
capture_status          : full | partial | none | disabled_by_accommodation | disabled_by_consent
flag_influence          : none | probe_order | technique | budget_boost   (technique is reserved; never emitted in v2.1 — see §12.3)
dto_turn_type           : main_question | follow_up | candidate_questions | closing
phase_label             : interview | your_questions | closing
blueprint_mode          : requisition | candidate
bedrock_basis           : stated_details | honest_floors | not_reached      (03 output; honest_floors never yields supported — §15)
refsim_artifact         : none | generic | specific | not_asked            (03 technique_results.refsim.artifact_described)
metric_part             : baseline | window | definition | source | confounders | causality
end_reason              : completed | time_hard_stop | candidate_stop | escalated_to_human | technical
metric_status           : anchored | unanchored | withheld_confidential            (04 metric_table)
consistency_note_status : possible_conflict | clear_conflict | unresolved_after_reconciliation | clarification_needed   (04 consistency_notes)
reconciliation_resolution : resolved | partially_resolved | unresolved | not_asked  (04; superset of reconciliation_outcome + not_asked)
```

---

## 3. `interview_input` (backend → 01)

```json
{
  "schema_version": "interview_input/2.0",
  "requisition_id": "string", "session_id": "string",
  "mode": "enum:blueprint_mode|null (requisition = one call per requisition, no resume, produces the frozen requisition-level items; candidate = one call per session that adds resume claims on top of {{requisition_blueprint_json}}; null = single-pass legacy behaviour)",
  "effective_duration_minutes": "integer|null (backend-computed: duration_minutes scaled for time-based accommodation codes; equals duration_minutes when none; 01 plans to this value when present)",
  "job_title": "string", "field": "string",
  "field_family": "enum:field_family|null (01 infers when null and records it in role_summary)",
  "seniority": "enum:seniority", "employment_type": "string|null",
  "location_or_market": "string|null (only if job-relevant)",
  "interview_language": "string (BCP-47, e.g. 'en-IN'; every candidate_message must be in this language)",
  "duration_minutes": "integer (20-90)",
  "interview_style": "enum:interview_style", "interview_modality": "enum:interview_modality",
  "interview_purpose": "enum:interview_purpose",
  "pressure_level": "enum:pressure_level (copied from requisition config; never per candidate)",
  "pressure_rationale": "string|null (recruiter-written job-relatedness reason; REQUIRED when intense; logged)",
  "job_description": "string (verbatim, untrusted)",
  "must_have_skills": ["string"], "nice_to_have_skills": ["string"],
  "candidate_resume": "string|null (verbatim AFTER the redaction pass, untrusted; null only in mode == requisition)",
  "resume_redaction_applied": "boolean (backend MUST set true; photo, DOB/age, gender, marital status, religion, caste, nationality, address beyond city removed)",
  "candidate_portfolio_or_context": "string|null (untrusted)",
  "company_context": "string|null (untrusted; the ONLY permitted source for answering candidate questions)",
  "interviewer_constraints": "string|null (e.g. 'no coding task; candidate may use paper')",
  "accommodation_notes": {
    "codes": ["enum:accommodation_code"],
    "operational_note": "string|null (how to run the interview; MUST NOT describe any condition, diagnosis or reason)",
    "behavioral_analysis_consent": "boolean (false => no capture, no attention_flags, report block disabled_by_consent)",
    "timing_triggers_disabled": "boolean (true whenever any code is applied or consent is false)"
  },
  "consent": {"ai_interview_notice_ack": "boolean", "recording_consent": "boolean", "notice_version": "string"}
}
```

Rules: `accommodation_notes.codes` may grow during the interview via 02 `recommended_state_update.accommodation_code_applied`. Prompts 02/03/04 receive `accommodation_applied: boolean` only — never codes' reasons. Backend rejects input when `resume_redaction_applied == false`, `pressure_level == intense` with null `pressure_rationale`, or `ai_interview_notice_ack == false`. The code `human_interviewer` is granted like any other code (`accommodation_request {code: human_interviewer, granted: true}`) AND ends the AI interview: `escalate_to_human {flag: true, reason: accommodation_unavailable}` with `scripts.escalate_closing`. A need matching no code at all (e.g. a request to reschedule to another day) is likewise `accommodation_unavailable` with `code: null`. `company_context` is forwarded to 02 only inside `session_state.company_context` during `phase == candidate_questions` (§6).

---

## 4. `policy_snapshot` (backend → 01; echoed into `session_state`)

```json
{
  "policy_version": "string", "pressure_level": "enum:pressure_level",
  "probe_budget_base": "integer", "probe_hard_cap_per_question": "integer", "interview_probe_pool_factor": "number",
  "callbacks_max": "integer", "reconciliations_max": "integer", "premises_max": "integer",
  "mutations_per_case_max": "integer", "l3_attempts_per_interview_max": "integer",
  "ladder_policy": "enum:ladder_policy", "non_linear_entry_share": "number (0-1)",
  "anchor_first_on_resume_claims": "boolean", "behavioral_boost_max": "integer (0 or 1)",
  "reserve_pct": "number (0.10)", "reserve_min_minutes": "integer (4)",
  "max_answer_seconds": "integer (180)", "case_max_answer_seconds": "integer (240)",
  "candidate_message_max_words": "integer (45)", "verbatim_question_max_words": "integer (60)"
}
```

Values per pressure level are fixed in §16 and stored in `backend/policy/pressure_levels.json`; frozen at blueprint time.

---

## 5. `interview_blueprint` (01 output; consumed by backend, 02, 03, 04)

Owned here, mirrored verbatim as 01's REQUIRED JSON SHAPE. Nullable objects (`null` when not applicable): `ladder` (null unless the competency is CRITICAL), `metric_scaffold`, `obvious_alternative`, `realistic_mutation`, `disconfirmation_probe`, `stakeholder_teachback`, `callback_pair`, `handoff_to_trace`, `resume_claims[].failure_probe`, `interview_plan[].failure_probe`, `devils_advocate_premise`, `scenario`, `scenario.bridge_probe`, `hidden_fact_table[].inject_at_tier`, `ladder_ref`, `estimate_probe`, `measurement_spec`, `anchor_set` (case/warm_up).

Canonical definitions used by every file: **CRITICAL competency** = `is_must_have == true OR weight >= 15` (the one and only ladder trigger; 04's "critical competency" is the same set). **Verification kit scope** = a `resume_claims[]` item with `materiality: low` carries only `anchor_set`, `bedrock_indicators`, `verification_techniques_ordered`, `drill_plan` and `failure_probe` (when `involves_shipped_thing`); every other kit field is `null`. `metric_scaffold` is required when `involves_metric AND materiality != low`; `disconfirmation_probe` is required for a causal claim only when `materiality != low`.

```json
{
  "blueprint_version": "2.1",
  "policy_echo": {"pressure_level": "enum:pressure_level", "policy_version": "string"},
  "role_summary": {
    "job_title": "string", "field": "string", "field_family": "enum:field_family", "seniority": "enum:seniority",
    "role_outcomes": ["string"], "explicit_requirements": ["string"], "reasonable_inferences": ["string"], "missing_information": ["string"],
    "jd_key_phrases": ["string (<=8 words each; for B19 overlap check)"],
    "ownership_expectation_for_seniority": "string (used by 03/04 to calibrate ownership_demonstrated)",
    "domain_vocabulary": {"artifact_types": ["string"], "constraint_families": ["enum:constraint_family"], "metric_types": ["string"], "stakeholder_roles": ["string"]},
    "plausibility_bands": [{"attribute": "string", "role_normal_range": "string", "rationale": "string"}]
  },
  "competencies": [{
    "id": "string (C{n})", "name": "string", "weight": "integer (sum of all = 100)", "is_must_have": "boolean",
    "why_it_matters": "string", "evidence_to_seek": ["string (evidence types, not keywords)"], "claims_requiring_evidence": ["string"],
    "start_rung": "enum:difficulty_tier", "seniority_bar_rung": "enum:difficulty_tier",
    "ladder": {
      "L1": {"question": "string (<=40 words)", "what_passing_looks_like": "string", "what_ceiling_looks_like": "string", "time_budget_minutes": "number"},
      "L2": {"question_template": "string (<=60 words; may contain {{candidate_l1_choice}})", "what_passing_looks_like": "string", "what_ceiling_looks_like": "string", "time_budget_minutes": "number"},
      "L3": {"question_template": "string (<=60 words; may contain {{candidate_l1_choice}})", "what_passing_looks_like": "string", "what_ceiling_looks_like": "string", "time_budget_minutes": "number"}
    }
  }],
  "resume_claims": [{
    "id": "string (R{n})", "verbatim": "string", "claim_type": "enum:claim_type", "materiality": "enum:materiality",
    "recency_years_approx": "number|null", "involves_shipped_thing": "boolean", "involves_decision": "boolean", "involves_metric": "boolean",
    "primary_question_id": "string",
    "anchor_set": ["string (3-5 facts to pin before any narrative)"],
    "verification_techniques_ordered": ["enum:technique"], "ownership_isolation_required": "boolean",
    "drill_plan": {"level_2_instance_target": "string", "level_3_mechanism_target": "string", "level_4_expected_artifact_type": "string", "level_5_expected_number_or_defect_type": "string"},
    "bedrock_indicators": ["string (2-4; details a genuine performer at this seniority knows without documents)"],
    "metric_scaffold": {"headline": "string", "baseline_question": "string", "window_question": "string", "definition_question": "string", "source_question": "string", "confounders_question": "string", "causality_question": "string", "likely_confounders": ["string"], "pre_anchored_parts": ["enum:metric_part (parts the resume text itself already states; 02 skips them)"]},
    "obvious_alternative": {"alternative": "string (<=12 words)", "why_credible": "string", "expected_tradeoff": "string", "acceptable_rejection_reasons": ["string"], "acceptable_acceptance_reasons": ["string"]},
    "realistic_mutation": {"mutation_id": "string", "constraint_family": "enum:constraint_family", "mutation_text": "string (<=45 words)", "expected_reasoning_shift": "string", "expected_invariants": ["string"], "jd_justification": "string"},
    "failure_probe": "string|null (<=30 words; required when involves_shipped_thing, else null)",
    "disconfirmation_probe": {"competing_cause": "string", "question": "string (<=40 words)"},
    "stakeholder_teachback": {"stakeholder_role": "string", "naive_question": "string", "what_mapping_looks_like": "string"},
    "handoff_to_trace": "string|null",
    "callback_pair": {"angle": "enum:callback_angle", "question_template": "string (<=45 words; assumes claim true; never references the earlier statement; same name as callback_queue_entry.question_template)", "earliest_after_question_order": "integer (>= primary order + 2)", "what_consistent_looks_like": "string", "what_honest_floor_looks_like": "string (<=25 words; the honest not-my-part / don't-recall answer that closes the callback without penalty)"}
  }],
  "interview_plan": [{
    "order": "integer", "question_id": "string (Q{n})", "time_budget_minutes": "number (includes probe allowance)",
    "question_type": "enum:question_type", "target_competencies": ["string"], "linked_resume_claim_ids": ["string"],
    "candidate_facing_question": "string (verbatim; <=60 words; one question mark)", "entry_point": "enum:entry_point",
    "anchor_set": ["string"], "purpose": "string", "bedrock_indicators": ["string"],
    "strong_answer_signals": ["string (evidence types)"], "shallow_answer_signals": ["string"],
    "probe_plan": [{"technique": "enum:technique", "trigger_patterns": ["enum:pattern"], "probe_text": "string (<=45 words)", "evidence_sought": "string", "stop_when": "string"}],
    "constraint_mutations": [{"mutation_id": "string", "constraint_family": "enum:constraint_family", "mutation_text_template": "string (<=45 words; may contain {{candidate_l1_choice}})", "expected_reasoning_shift": "string", "expected_invariants": ["string"], "shallow_signals": ["string"], "jd_justification": "string"}],
    "credible_alternatives": [{"alternative": "string", "why_credible": "string", "acceptable_rejection_reasons": ["string"], "acceptable_acceptance_reasons": ["string"]}],
    "devils_advocate_premise": {"premise_text": "string (framed as a colleague's view)", "the_flaw": "string", "correct_correction": "string", "why_common_misconception": "string", "minimum_seniority": "enum:seniority"},
    "failure_probe": "string|null",
    "disconfirmation_probe": {"competing_cause": "string", "question": "string"},
    "stakeholder_teachback": {"stakeholder_role": "string", "naive_question": "string", "what_mapping_looks_like": "string"},
    "estimate_probe": {"question": "string", "inputs_from_fact_ids": ["string"], "reference_range": "string"},
    "measurement_spec": {"success_metric": "string", "plausible_baseline": "string", "minimum_window": "string", "obvious_confounder": "string", "counter_metric": "string"},
    "scenario": {
      "setup_text": "string (<=120 words; ends with 'Ask me for anything you would need to know.')", "role_outcome_tested": "string",
      "hidden_fact_table": [{"fact_id": "string", "fact_text": "string (revealed verbatim)", "unlocked_by_topic": "string", "value_tag": "enum:value_tag", "inject_at_tier": "enum:difficulty_tier|null", "default_assumption": "string"}],
      "high_value_clarifications": ["string"], "first_concrete_artifact": "string", "expected_failure_modes": ["string"],
      "bridge_probe": "{linked_resume_claim_id: string, probe_text: string, earliest_after_question_order: integer}|null"
    },
    "ladder_ref": {"competency_id": "string", "rung": "enum:difficulty_tier"},
    "scoring_focus": ["string"]
  }],
  "callback_pairs": [{"claim_id": "string (R{n})", "primary_question_id": "string", "angle": "enum:callback_angle", "question_template": "string", "earliest_after_question_order": "integer", "what_consistent_looks_like": "string", "what_honest_floor_looks_like": "string", "priority": "integer 1-3"}],
  "interview_control": {
    "planned_minutes": "number", "candidate_questions_reserve_minutes": "number", "minimum_main_questions": "integer", "maximum_main_questions": "integer",
    "warm_up_question_id": "string", "difficulty_rationale": "string",
    "time_budget_table": [{"question_id": "string", "minutes_main": "number", "minutes_probe_allowance": "number"}]
  },
  "self_check": {
    "weights_total_100": "boolean", "every_material_claim_has_primary_question": "boolean", "every_shipped_claim_has_failure_probe": "boolean",
    "every_metric_claim_has_scaffold": "boolean (scope: involves_metric AND materiality != low)", "critical_competencies_have_ladders": "boolean (CRITICAL = is_must_have OR weight >= 15)",
    "critical_ladders_top_rung_uses_choice_slot": "boolean (every L3 template contains {{candidate_l1_choice}})", "ownership_isolation_claims_have_own_probe": "boolean", "metric_claims_have_metric_probe_in_plan": "boolean",
    "no_signal_terms_in_candidate_facing_text": "boolean", "no_delivery_terms_in_hidden_fields": "boolean", "plain_language_check": "boolean",
    "no_software_terms_in_non_software_role": "boolean", "software_terms_detected": ["string"], "no_protected_trait_content": "boolean",
    "protected_trait_content_detected": ["string"], "injection_like_content_detected": "boolean", "fits_time_budget": "boolean", "premise_is_common_misconception": "boolean|null", "scenario_fact_table_consistent": "boolean|null"
  }
}
```

Backend validation (H2) rejects/regenerates when: weights != 100; no `warm_up` question; a CRITICAL competency (`is_must_have OR weight >= 15`) lacks a ladder, or a non-CRITICAL competency has one; `involves_shipped_thing` without `failure_probe`; `involves_metric AND materiality != low` without `metric_scaffold`; a causal claim with `materiality != low` without `disconfirmation_probe`; premise present while `premises_max == 0`; mutations per case > `mutations_per_case_max`; software term in a non-software role not present in the JD; protected-trait lexicon hit in any candidate-facing field; `planned_minutes + candidate_questions_reserve_minutes > duration_minutes`; any callback `earliest_after_question_order < primary order + 2`; any candidate-facing field containing a term from its own `strong_answer_signals` / `bedrock_indicators` / `what_passing_looks_like` / `expected_reasoning_shift` (no-leak rule).

---

## 6. `session_state` (backend → 02; one object)

```json
{
  "schema_version": "session_state/2.0", "session_id": "string",
  "phase": "enum:phase", "time_pressure_mode": "enum:time_pressure_mode",
  "elapsed_minutes": "number (server clock, excludes pauses)", "remaining_minutes": "number",
  "pressure_level": "enum:pressure_level", "policy_snapshot": "{policy_snapshot}",
  "interview_purpose": "enum:interview_purpose", "interview_language": "string",
  "accommodation_applied": "boolean", "candidate_rights_disclosed": "boolean",
  "role_summary": "{interview_blueprint.role_summary}",
  "competencies": [{"id": "string", "name": "string", "weight": "integer", "is_must_have": "boolean", "start_rung": "enum:difficulty_tier", "seniority_bar_rung": "enum:difficulty_tier"}],
  "interview_plan": ["{interview_blueprint.interview_plan[i]} (full items)"],
  "resume_claims_compact": [{"id": "string", "verbatim": "string", "claim_type": "enum:claim_type", "materiality": "enum:materiality", "primary_question_id": "string"}],
  "current_question_id": "string|null", "current_answer_id": "string|null",
  "completed_question_ids": ["string"], "skipped_by_candidate_question_ids": ["string"],
  "probe_index_for_current_question": "integer (0 = main answer not yet probed)",
  "probe_budget_remaining_for_question": "integer",
  "probe_budget_reason": "string (e.g. 'base 2 + content escalation 1 (B12_unsupported_metric, B04_collective_ownership)')",
  "interview_probe_pool_remaining": "integer", "reframe_used_for_current_rung": "boolean",
  "evaluator_directives": ["{evaluator_directive}"],
  "ladder_instruction": {"competency_id": "string", "action": "enum:ladder_action", "rung": "enum:difficulty_tier", "rung_text": "string|null (backend has already filled {{candidate_l1_choice}})"},
  "callback_due": "{callback_queue_entry}|null", "callbacks_remaining": "integer",
  "reconciliation_due": {"claim_id_a": "string", "quote_a": "string (verbatim)", "claim_id_b": "string", "quote_b": "string (verbatim)", "attribute": "string"},
  "reconciliations_remaining": "integer", "premises_remaining": "integer", "l3_attempts_remaining": "integer",
  "mutations_used_for_current_question": ["string"],
  "case_state": {"revealed_fact_ids": ["string"], "clarifications_asked_count": "integer", "candidate_choice_summary": "string|null", "stated_assumptions": ["string"]},
  "ledger_compact": [{"claim_id": "string", "normalized_statement": "string", "claim_type": "enum:claim_type", "verification_status": "enum:verification_status", "ownership_asserted": "enum:ownership_asserted", "materiality": "enum:materiality"}],
  "transcript_digest": [{"question_id": "string", "digest": "string (<=80 words, score-free)", "evidence_grade": "enum:evidence_grade", "unresolved_claim_ids": ["string"]}],
  "recent_turns": ["{transcript_entry} (all turns of the current question + last 2 turns of the previous question)"],
  "latest_candidate_answer": "string|null (paralinguistic tokens stripped)",
  "attention_flags": ["{attention_flag_item} — NON-SCORED probe-targeting hints; [] when none; key ABSENT when capture is disabled"],
  "company_context": "string|null (verbatim interview_input.company_context; non-null ONLY while phase == candidate_questions; the sole permitted source for answering candidate questions)",
  "scripts": "{scripts} (§19; every key present, already in interview_language)"
}
```

Rules: `ladder_instruction` is `null` when no ladder is active for this turn; `reconciliation_due` is `null` when nothing is due (both nullable — chosen for consistency with `callback_due`). `ledger_compact` holds open items only (max 12). The raw JD and resume are NOT in `session_state`; 02 works from `role_summary`, the plan, the ledger and the transcript. `case_state` is `null` when the current question has no scenario. `company_context` is `null` in every phase except `candidate_questions` (token control; 02 answers candidate questions from `role_summary` + `company_context` only and uses `scripts.candidate_questions_unknown` when neither covers it).

`scripts` object (all keys required; strings only; see §19 for the English source text):

```json
{
  "opening_disclosure": "string", "candidate_questions_opener": "string", "candidate_questions_unknown": "string", "another_question": "string", "questions_later_line": "string",
  "closing": "string", "escalate_closing": "string",
  "no_single_expected_answer_line": "string", "idk_ack": "string", "correction_line": "string", "hidden_info_line": "string", "hint_line": "string",
  "skip_line": "string", "accommodation_line": "string (contains the literal slot [CHANGE]; 02 replaces it with one plain sentence)",
  "confidentiality_line": "string", "reconciliation_join_line": "string",
  "assume_line": "string", "go_ahead_line": "string", "take_your_time": "string", "break_resume_line": "string", "rephrase_offer_line": "string"
}
```

---

## 7. `assessment_input` (backend → 03; contains NO behavioral data)

```json
{
  "schema_version": "assessment_input/2.0", "session_id": "string", "question_id": "string", "answer_id": "string",
  "seniority": "enum:seniority", "pressure_level": "enum:pressure_level", "time_pressure_mode": "enum:time_pressure_mode",
  "interview_purpose": "enum:interview_purpose",
  "interview_language": "string (BCP-47; every probe_directives[].suggested_wording MUST be written in this language — the fast path commits it to the candidate without 02)",
  "accommodation_applied": "boolean (true => never compare timing, answer length or fluency)",
  "role_summary": "{interview_blueprint.role_summary}",
  "relevant_competencies": ["{interview_blueprint.competencies[k]} (incl. ladder, start_rung, seniority_bar_rung)"],
  "blueprint_question": "{interview_blueprint.interview_plan[i]} (full hidden item)",
  "linked_resume_claims": ["{interview_blueprint.resume_claims[j]}"],
  "asked_turn": {
    "text": "string", "turn_type": "enum:turn_type", "technique": "enum:technique",
    "asked_question_source": "enum:asked_question_source", "ladder_rung": "enum:difficulty_tier|null",
    "mutation_id": "string|null", "premise_used": "boolean",
    "callback_context": {"claim_id": "string", "original_quote": "string", "angle": "enum:callback_angle"},
    "reconciliation_context": {"claim_id_a": "string", "quote_a": "string", "claim_id_b": "string", "quote_b": "string"},
    "directive_executed": "{evaluator_directive}|null"
  },
  "candidate_answer": "string (bracketed paralinguistic tokens and timing metadata stripped by backend)",
  "probes_used_this_question": "integer", "probe_budget_remaining": "integer",
  "ladder_state_for_competency": {"current_rung": "enum:difficulty_tier|null", "highest_rung_passed": "enum:rung_or_none", "reframe_used": "boolean"},
  "case_state": "{session_state.case_state}|null",
  "claim_ledger": ["{claim_ledger_entry} (compact; max 40; oldest supported pruned first)"],
  "transcript_digest": ["{session_state.transcript_digest[i]}"],
  "recent_turns": ["{transcript_entry}"],
  "plausibility_bands": ["{interview_blueprint.role_summary.plausibility_bands[i]}"]
}
```

`callback_context` and `reconciliation_context` are `null` unless the asked turn was a CALLBACK / RECONCILE. Never present: `attention_flags`, `behavioral_signals`, timing metadata, bracketed tokens.

---

## 8. `final_assessment_input` (backend → 04; contains NO behavioral data; post-close only)

```json
{
  "schema_version": "final_assessment_input/2.0", "session_id": "string",
  "interview_config": {"job_title": "string", "field": "string", "field_family": "enum:field_family", "seniority": "enum:seniority", "pressure_level": "enum:pressure_level", "pressure_rationale": "string|null", "interview_purpose": "enum:interview_purpose", "duration_minutes": "integer", "interview_modality": "enum:interview_modality", "accommodation_applied": "boolean", "interview_language": "string"},
  "candidate_resume": "string (redacted verbatim)",
  "interview_blueprint": "{interview_blueprint}",
  "full_transcript": ["{transcript_entry}"],
  "answer_evaluations": ["{03 output} (see 03 REQUIRED JSON SHAPE)"],
  "claim_ledger_final": ["{claim_ledger_entry} (full, with revision_history and conflict_pairs)"],
  "callback_log": ["{callback_queue_entry}"],
  "reconciliation_log": [{"claim_id_a": "string", "claim_id_b": "string", "asked_turn_index": "integer", "result": "enum:reconciliation_outcome", "candidate_explanation_quote": "string"}],
  "ladder_state": [{"competency_id": "string", "highest_rung_attempted": "enum:rung_or_none", "highest_rung_passed": "enum:rung_or_none", "ceiling_found": "boolean", "seniority_bar_rung": "enum:difficulty_tier", "reframes_used": "integer"}],
  "probe_audit_content_only": [{"question_id": "string", "probes_used": "integer", "content_escalations": "integer", "callbacks_used": "integer", "mutations_used": "integer", "premise_used": "boolean", "techniques_used": ["enum:technique"]}],
  "coverage": {"questions_planned": "integer", "questions_asked": "integer", "skipped_by_candidate": ["string"], "not_reached": ["string"], "reserve_honored": "boolean", "end_reason": "enum:end_reason"}
}
```

---

## 9. `claim_ledger_entry`

Backend-owned, append-only (new `version`, never overwrite). 03 proposes entries (`claim_id: "NEW"`) and `ledger_updates`; the backend validates (quote must exist verbatim in transcript/resume; protected-trait filter must pass), assigns ids, merges, runs the deterministic checks below. 02 reads `ledger_compact`; 04 reads the full ledger.

Field provenance (fields no prompt emits directly; the backend populates them at merge time so that 04's aggregations always read a written value):

| Field | Populated by |
|---|---|
| `ownership_demonstrated`, `actors_by_role` | Copied from the answer-level 03 `ownership.{ownership_demonstrated, actors_by_role}` onto every claim extracted from that answer AND onto every existing claim in `target_claim_ids` of an OWN / COUNTERFACTUAL / HANDOFF / REFSIM / CALLBACK(role_swap) turn. Later values replace earlier ones only when they are not `not_probed`; resume-seeded R{n} rows start at `not_probed` / `[]`. |
| `time_reference` | `claims_extracted[].value` + `unit` when `claim_type in {timeline}`; otherwise the duration/date fragment of `normalized_statement` if present, else `null`. Never converted to a form that reveals age. |
| `linked_claim_ids` | Deterministic checks: `conflicts_with` from Value mismatch / Ownership drift / Resume mismatch; `supports` or `refines` when a new claim shares `entity` + `attribute` with an existing one and is inside `tolerance_band`; `entails` from Timeline order. |
| `corroboration_offered` | Set only after a REFSIM turn: `type` from the answer's `claims_extracted` item with `claim_type: provenance` (`artifact` / `role_account` / `record` by its `attribute`), `description` = its `normalized_statement`, `coheres_with_ledger` = no open `conflict_pairs` on the target claim. `{null, null, null}` otherwise. |
| `tolerance_band`, `probes_spent`, `callback.*`, `conflict_pairs`, `revision_history`, `specificity_level`, `peripheral_detail_present`, `verification_status` transitions | Backend from `ledger_updates`, 03 `specificity`, `technique_results.callback_consistency`, the checks table and the callback queue. |

```json
{
  "claim_id": "string (CL{n} | R{n})", "session_id": "string", "version": "integer",
  "source": {"kind": "enum:claim_source_kind", "resume_claim_id": "string|null", "question_id": "string|null", "answer_id": "string|null", "turn_index": "integer|null", "seg_id": "integer|null"},
  "verbatim_quote": "string (<=200 chars, exact)", "normalized_statement": "string (<=160 chars)",
  "claim_type": "enum:claim_type",
  "entity": "string (normalized project/initiative key; same project matches across turns)",
  "attribute": "string|null (e.g. team_size, duration_months, role, cost_change_pct)", "value": "string|null", "unit": "string|null",
  "precision_qualifier": "enum:precision_qualifier",
  "tolerance_band": "string|null (backend-set from claim_type + qualifier; e.g. '+/-20% relative', 'categorical')",
  "time_reference": "string|null (as stated; never converted to a form that reveals age)",
  "materiality": "enum:materiality", "competency_ids": ["string"],
  "is_anchor": "boolean (pinned by ANCHOR; drift on anchors weighs more)",
  "ownership_asserted": "enum:ownership_asserted", "ownership_demonstrated": "enum:ownership_demonstrated",
  "actors_by_role": ["string (roles only, never names)"], "provenance": "enum:provenance",
  "specificity_level": "integer 0-5 (deepest drill level reached: 0 none, 1 narrative, 2 instance, 3 mechanism, 4 artifact, 5 number/defect on artifact)",
  "peripheral_detail_present": "boolean",
  "metric_provenance": {"baseline": "enum:metric_part_status", "window": "enum:metric_part_status", "definition": "enum:metric_part_status", "source": "enum:metric_part_status", "confounders": "enum:metric_part_status", "causality": "enum:metric_part_status", "persistence": "enum:metric_part_status"},
  "verification_status": "enum:verification_status", "why_unsupported": "enum:why_unsupported|null", "probes_spent": "integer",
  "linked_claim_ids": [{"claim_id": "string", "relation": "enum:claim_relation"}],
  "conflict_pairs": [{"other_claim_id": "string", "quote_a": "string", "quote_b": "string", "delta": "string", "tolerance_exceeded": "boolean", "detected_by": "enum:conflict_detected_by"}],
  "revision_history": [{"turn_index": "integer", "new_value": "string", "candidate_initiated": "boolean"}],
  "callback": {"planned": "boolean", "angle": "enum:callback_angle|null", "earliest_after_question_order": "integer|null", "callback_id": "string|null", "result": "enum:callback_result|null"},
  "corroboration_offered": {"type": "enum:corroboration_type|null", "description": "string|null", "coheres_with_ledger": "boolean|null"},
  "protected_trait_filter_passed": "boolean (must be true to store; failing entries are dropped at extraction)",
  "last_updated_turn": "integer"
}
```

Deterministic backend checks after every merge (feed `reconciliation_due`, the callback queue and pattern `B18_cross_turn_drift`):

| Check | Rule | Result |
|---|---|---|
| Value mismatch | same `entity` + `attribute`, values differ beyond `tolerance_band`, both quotes specific (not `hedged`/`approx`) | `possible_conflict`; `clear_conflict` only when material AND (both anchors OR repeated) |
| Ownership drift | `ownership_asserted` for the same decision entity changes level across turns | `narrowed` or `possible_conflict`; callback angle `role_swap` |
| Timeline order | an event that entails another is placed before it | `possible_conflict`; TIMELINE probe |
| Scale arithmetic | scope_units / (team_size x duration) outside `plausibility_bands` | probe trigger only (RESOURCE neutral how-question); never a score input |
| Resume mismatch | answer scope/title/dates materially differ from R{n} | `possible_conflict` linked to R{n} |
| Metric unanchored | >= 2 of {baseline, window, source} still `missing` after one METRIC probe | `unsupported_after_probing` + `why_unsupported` |

A candidate's explicit correction sets `revised_by_candidate` and closes the item. Hedged/approximate statements widen tolerance and never produce `clear_conflict`. Nothing touching a protected trait is ever stored.

---

## 10. `callback_queue_entry`

```json
{
  "callback_id": "string", "claim_id": "string", "scheduled_by": "enum:callback_scheduled_by", "angle": "enum:callback_angle",
  "question_template": "string (<=45 words; assumes the claim is true; asks about a consequence a real owner faced; NEVER references the earlier statement)",
  "what_honest_floor_looks_like": "string|null (copied from the blueprint callback_pair; null for evaluator/backend_check callbacks)",
  "forbidden_angles": ["enum:callback_angle (already probed on this claim)"],
  "what_consistent_looks_like": "string", "priority": "integer 1-3",
  "origin_question_order": "integer", "earliest_after_question_order": "integer (>= origin + 2)",
  "status": "enum:callback_status", "asked_turn_index": "integer|null", "result": "enum:callback_result|null"
}
```

Scheduler (backend): the queue is seeded at blueprint acceptance from `interview_blueprint.callback_pairs[]` (`scheduled_by: blueprint`; field names are identical, so no mapping) and grown from 03 `callback_candidates` (`evaluator`) and §9 checks (`backend_check`). Status becomes `due` when `current_question_order >= earliest_after_question_order` AND `time_pressure_mode != reserve` AND the previous turn was not a callback AND `callbacks_remaining > 0`. One callback per claim, ever. `high` materiality outranks `medium`; ties by `priority`. Callbacks not asked by close become `expired` and are reported `not_tested` with `why_unsupported: time`. Tolerance bands apply to results (5% vs 6% is `consistent`; "about a quarter" vs "4 months" is `consistent`).

---

## 11. `evaluator_directive` (03 → backend → 02)

```json
{
  "rank": "integer (1-3, unique within one evaluation)", "technique": "enum:technique",
  "target_quote": "string (<=15 words, verbatim from the latest answer or a ledger quote)", "target_claim_id": "string|null",
  "evidence_sought": "string (<=160 chars)",
  "suggested_wording": "string (<=45 words; obeys every candidate_message rule; introduces no hidden-signal term; exactly one question mark)",
  "abandon_if": "string (<=160 chars; the answer that would satisfy this directive)",
  "requires_state": "boolean (true when 02 must supply state text: ladder rung, fact reveal, mutation text)"
}
```

Precedence: 02 executes rank 1 unless (a) it violates a fairness rule, (b) the latest answer already satisfies `abandon_if`, or (c) `probe_budget_remaining_for_question == 0`. 02 never invents a probe while a directive exists. Directives are cleared when the question completes; unexecuted directives on `high` materiality claims become `callback_candidates`. Fast path (H16): when `recommended_next_action == probe`, budget allows, `requires_state == false`, and `suggested_wording` passes the H8 output guard, the backend commits it as `follow_up` with `source: fast_path` and skips the 02 call — never for CALLBACK, RECONCILE, LADDER, MUTATE with slot, PREMISE, REVEAL.

---

## 12. `behavioral_signals` (ML services → backend) and `attention_flags` (backend → 02 only)

**Contract status: NON-SCORED. This is a hard rule, not a preference.** Behavioral signals are probe-targeting hints and attention flags for the interviewer only. They are never a competence-score input, never a pattern basis, never evidence of honesty, stress, confidence, preparation, AI use or reading, and never appear in any score, finding, ceiling, recommendation or reviewer-facing field except the backend-injected `non_scored_behavioral_context` block in the final report, which is labelled non-scored. The full envelope never reaches any prompt. 03 and 04 never receive any behavioral data (contract test: their outputs are byte-identical with and without the envelope). Only 02 receives the derived `attention_flags`, and only in the reduced form below (unit test: no numeric field survives).

### 12.1 Envelope (per answer; `additionalProperties: false` at every level)

```json
{
  "schema_version": "behavioral_signals/1.0", "session_id": "string", "answer_id": "string", "question_id": "string", "turn_index": "integer",
  "window": {"start_ms": "integer >=0", "end_ms": "integer > start_ms", "answer_duration_ms": "integer", "clock": "enum:server"},
  "calibration": "boolean (true for the warm-up answer used as the candidate's own baseline)",
  "producers": [{"service": "enum:signal_producer", "model_version": "string (semver)", "status": "enum:producer_status", "coverage_ratio": "number 0-1", "processing_latency_ms": "integer"}],
  "speech": {"words_per_minute": "{M}", "filler_rate_per_min": "{M}", "pause_count_over_2s": "{M}", "longest_pause_ms": "{M}", "restart_count": "{M}", "asr_confidence_mean": "number 0-1"},
  "fluency": {"hesitation_score": "{M} (0-1)", "reading_cadence_score": "{M} (0-1)", "events": [{"type": "enum:fluency_event", "at_ms": "integer", "duration_ms": "integer"}]},
  "gaze": {"on_screen_ratio": "{M} (0-1)", "off_screen_saccade_count": "{M}", "sustained_off_screen_ms_max": "{M}", "off_screen_direction_consistency": "{M} (0-1)", "events": [{"type": "enum:off_screen", "at_ms": "integer", "duration_ms": "integer"}]},
  "body": {"face_visible_ratio": "{M} (0-1)", "posture_shift_count": "{M}", "face_out_of_frame_ms": "{M}"},
  "timing": {"response_latency_ms": "integer (server: t_first_speech - t_question_rendered)", "speech_ratio": "number 0-1"},
  "environment": {"audio_dropout_ms": "integer", "video_dropout_ms": "integer", "network_quality": "enum:network_quality"},
  "integrity_events": [{"type": "enum:integrity_event", "at_ms": "integer", "duration_ms": "integer", "confidence": "number 0-1"}],
  "baseline_delta": {"words_per_minute_pct": "number|null", "filler_rate_pct": "number|null", "on_screen_ratio_pct": "number|null"}
}
```

`{M}` = `{"value": "number", "confidence": "number 0-1", "baseline_delta_pct": "number|null"}`.

**Denylisted keys — the whole envelope is rejected with HTTP 422 and logged if any appears at any depth:** emotion, affect, stress, anxiety, nervousness, confidence_label, deception, honesty, personality, engagement, age, gender, ethnicity, accent, attractiveness, disability, health, face_embedding, raw_frames, raw_audio. No "lie detection", "fumble score", "confidence score", "authenticity score" or "engagement score" exists anywhere in the system.

### 12.2 Fusion (backend, pure function, versioned `fusion_rules_version`)

`behavioral_to_attention(envelope, baseline) -> attention_flags[]`. Rules: compare only against the candidate's own warm-up baseline (`calibration: true`), never population thresholds; drop any `{M}` with `confidence < 0.6` or from a producer with `coverage_ratio < 0.7`; at most one flag per `attention_flag` type per answer; integrity events are logged for the human reviewer only and never become flags; missing or degraded producers yield `flags_availability: partial|none`, never a flag. Off switches: any accommodation code applied, `behavioral_analysis_consent == false`, or camera off → capture stops, `attention_flags` key is ABSENT from `session_state`, `behavioral_boost_max` is treated as 0, report block shows `capture_status: disabled_*`.

### 12.3 `attention_flag_item` (the ONLY behavioral view any prompt receives; 02 only)

```json
{"flag": "enum:attention_flag", "strength": "enum:attention_strength", "span_hint_text": "string|null (<=15 words of transcript near which the flag fired)"}
```

Preamble embedded VERBATIM in 02 (§8.4) and in the `session_state.attention_flags` documentation (CI byte-compares it): *"attention_flags, when present, are NON-SCORED probe-targeting hints: machine estimates of behavior with known false positives for disability, neurodivergence, anxiety, cultural eye-contact norms, assistive technology, connectivity and camera setup. They may influence only (a) which already-permitted content probe is asked first and (b) whether to offer a repeat or rephrase. Never mention, never ask about, never score, never infer stress, honesty or confidence, never change tone because of them. When the key is absent, behave as if no flags exist."*

Permitted uses (exactly two; only items with `strength: high` act — `low`/`med` items change nothing anywhere): (a) when two or more evaluator directives are equally rank-eligible after declines, a flag may pick which is executed first (`attention_flag_use: selected_probe_order`); a flag never selects or changes a technique, never converts `advance` into `probe`, and never composes a probe when `evaluator_directives` is empty (`selected_technique` is reserved and never emitted); (b) a `long_pause` item may justify `scripts.rephrase_offer_line` (`offered_rephrase`; not a probe). Budget effect: see §14 (gated +1, never alone). Report value `influenced` is therefore `probe_order`, `budget_boost` or `none`.

### 12.4 `non_scored_behavioral_context` (backend-injected into the 04 report after validation; model emits `null`)

```json
{
  "disclaimer": "Non-scored context. These behavioral signals were not used in any competency score, finding, or recommendation above and must not be used by a reviewer to adjust them. Automated behavior analysis does not detect deception. Shown for follow-up-question audit only.",
  "capture_status": "enum:capture_status",
  "coverage": {"answers_with_signals": "integer", "answers_partial": "integer", "answers_without": "integer"},
  "flags_by_answer": [{"answer_id": "string", "question_id": "string", "flags": [{"flag": "enum:attention_flag", "strength": "enum:attention_strength", "influenced": "enum:flag_influence", "resolved_by_probe": "boolean|null", "resolution_note": "string|null (content-based, e.g. 'candidate supplied baseline and source in A_Q4_1; CL7 -> supported')"}]}],
  "integrity_events": [{"type": "string", "answer_id": "string", "duration_ms": "integer"}],
  "environment_quality_summary": "string", "producer_versions": ["string"],
  "used_in_scoring": false, "shown_by_default": false
}
```

Rendered last, collapsed, under the fixed disclaimer, as counts and flags only (no stills, no numeric metrics); omitted entirely when `capture_status` is `disabled_*`. A schema assertion forbids any behavioral-namespace key inside `competency_assessment`, `recommendation`, `recommendation_rationale`, `pattern_summary` or `consistency_notes`. Storage: separate store keyed by `session_id` + `answer_id`, no foreign key to scores in analytics exports, shorter retention than the transcript, purged on opt-out or accommodation.

---

## 13. `transcript_entry`

```json
{
  "turn_index": "integer", "role": "enum:transcript_role", "question_id": "string|null", "answer_id": "string|null",
  "turn_type": "enum:turn_type|null", "technique": "enum:technique|null", "target_claim_ids": ["string"],
  "probe_index": "integer|null", "ladder_rung": "enum:difficulty_tier|null", "is_callback": "boolean",
  "text": "string",
  "segments": [{"seg_id": "integer", "start_ms": "integer", "end_ms": "integer", "text": "string", "asr_confidence": "number"}],
  "committed_at": "string (ISO-8601)", "source": "enum:turn_source"
}
```

Before any prompt payload is built, candidate `text` is stripped of bracketed paralinguistic tokens (`[pause]`, `[laughs]`, `um`-tagging) and timing metadata; `segments` are sent to 03/04 only with `start_ms`/`end_ms` removed. 02 and 03 receive `transcript_digest` + `recent_turns`; only 04 receives `full_transcript`.

---

## 14. Probe budget rules (backend-enforced; prompts only read the result)

```text
1. BASE per main question        = probe_budget_base[pressure_level]            (calm 1 | standard 2 | intense 3)
2. CONTENT ESCALATION (+1, at most once per answer). After each 03 result:
     pattern_weight   = sum(severity of every pattern_flags item with basis in {text, ledger})
     distinct_moderate = count(distinct pattern ids with severity >= 2)
     escalate IF (pattern_weight >= 3 OR distinct_moderate >= 2) AND evidence_grade in {none, generic}
3. ATTENTION BOOST (+1, at most behavioral_boost_max per question; 0 at calm and whenever capture is disabled):
     ONLY IF the content escalation condition in rule 2 is met on the SAME answer
     AND an attention_flag of strength high fired on that answer.
     Never alone. Never beyond the hard cap. Always logged with the content pattern and quote that licensed it.
4. DE-ESCALATION:
     evidence_grade == specific_with_verification_detail AND pattern_weight == 0
        -> remaining budget for the question := 0; recommended_next_action forced to advance
           (after at least one probe if any linked_resume_claim of the question has ownership_isolation_required: true
            and OWN has not been asked on it).
     candid_signals non-empty AND pattern_weight == 0 -> remaining := max(0, remaining - 1).
5. HARD CAPS:
     cap_for_question  = min(base + escalations, probe_hard_cap_per_question[pressure_level])   (calm 3 | standard 4 | intense 4)
     interview pool    = ceil(planned_main_questions x interview_probe_pool_factor)            (1.25 | 1.5 | 1.75)
     A probe is BLOCKED when either is exhausted regardless of model output; the blocked item is recorded
     unsupported_after_probing with why_unsupported: budget.
6. TIME OVERRIDES BUDGET:
     tight   -> max one probe per remaining question; NO ladder_action of any kind (start, climb, hold_reframe and
                descend_once alike — the backend sets ladder_instruction to null), no mutations or premises;
                callbacks on high-materiality unresolved claims outrank new low-weight main questions.
     reserve -> no probes; no new main question / L3 / mutation / premise; candidate questions then closing.
7. SCARCE POOL: when interview_probe_pool_remaining < remaining planned main questions, escalation is granted only for
   questions whose target competencies carry is_must_have: true or weight >= 15.
8. HONEST FLOORS end the probe on that item ("I don't know but I would find out by...", "not my part; the controller owned it",
   "read but not done", "I overstated; my piece was X", "can't share the figure but roughly X"): the item is closed, the
   candid_signal removes the pattern it answers, and no budget is spent chasing it further. A floor REQUIRES process or shape
   (how it was handled, who owned it, the order of magnitude): a bare "I don't know" / "not sure" is not a floor and does not
   close the item (03 recommends reframe_once at the same rung, then move on). Floors never make a claim `supported`.
9. Every computation is stored per answer:
   {answer_id, pattern_weight, distinct_moderate, evidence_grade, content_escalation, attention_boost, base, cap,
    pool_before, pool_after, model_recommendation, backend_decision, override_reason}
10. Escalation is INVISIBLE to the candidate: no counters, colour changes or longer spinners; probes render as questions.
```

Worked example (finance, `standard`): Q3 main answer "We brought the close from nine days to five by automating reconciliations." → 03 flags B04 (sev 2), B12 (sev 2), B13 (sev 1); `evidence_grade: generic`. pattern_weight 5, distinct_moderate 2 → content escalation: budget 2 → 3 (`probe_budget_reason: "base 2 + content escalation 1 (B04_collective_ownership, B12_unsupported_metric)"`). Probe 1 (OWN) → "I built the accrual estimation rule; the controller owned the calendar" → `honest_down_scope` removes B04; budget stays 3, remaining 2. Probe 2 (METRIC baseline) → "nine business days, from the close tracker" → baseline `stated`, source `stated`. Probe 3 (METRIC window) → "measured over the next four closes" → metric anchored; remaining 0 → advance. Marketing counter-example (`calm`): base 1, B12 alone (sev 2) → pattern_weight 2, distinct_moderate 1 → no escalation; one METRIC probe, then advance; the claim is recorded `unsupported_after_probing (budget)` if still unanchored — never "false".

---

## 15. Difficulty tiers L1 / L2 / L3

| Tier | Definition (domain-agnostic) | Pass = score >= 3 at the rung | Typical wording |
|---|---|---|---|
| L1 | Recall / describe in own words from own experience; explain a concept plainly. | A correct, situated description with one concrete referent. | "In your own words, what does X tell you?" / "How did you set X on the last thing you launched?" |
| L2 | Apply to a concrete, role-realistic situation with a trade-off; must decide and say what is sacrificed or deferred. | Names the trade-off, chooses, states the cost, gives a first check with a reason. | "A distributor's receivable days went from 45 to 70 while revenue is flat. What do you look at first, and why?" |
| L3 | Edge case, failure mode, conflicting constraints, incomplete or adversarial information. Realistic pitfalls only. | Recognizes the mechanism, names the first check, distinguishes structural from one-off. | "You retrained and offline precision improved; six weeks later the outcome is worse. Plausible explanations, and which do you check first?" |

Seniority defaults (01 may override per competency with a one-line justification):

| Seniority | Start rung | Bar rung (ceiling below bar = gap; above bar = neutral) |
|---|---|---|
| intern | L1 | L1 |
| junior | L1 | L2 (partial L2 acceptable) |
| mid | L2 (L1 optional) | L2 |
| senior | L2 | L3 |
| lead / manager | L2 | L3 |

```text
LADDER RULES (backend computes ladder_instruction; 02 delivers; 03 records tier_result)
- Runs once per CRITICAL competency (is_must_have OR weight >= 15; §5), not per question. Rungs are identical for every candidate on the requisition.
- Backend trigger: when the next unfinished plan item in order is the item carrying ladder_ref for a competency whose ladder has not started, and time_pressure_mode == normal, the backend sets ladder_instruction {action: start, rung: start_rung, rung_text} on that turn; 02 never selects ladder items in S8 (they are delivered only through S6). If time is tight or reserve the ladder is skipped and the competency is reported not_assessed for ceiling.
- Start at start_rung. Climb one rung per turn after a pass (score >= 3).
- Score 2 at a rung -> one same-rung REFRAME (narrower, same difficulty, no hint), then record. One reframe per rung.
- Score <= 1 at L2/L3 with no prior pass -> one descend_once to confirm the floor. One descend per question.
- Stop at the first failed rung after the reframe. Never climb after the ceiling. Never announce tiers or signal failure;
  "let's try something easier" is banned. Ceiling is reported as "demonstrated up to Lx vs bar Ly" — a description, never a judgment.
- ladder_policy: to_bar = stop once bar passed; bar_plus_one = attempt one rung above bar; until_ceiling = climb until a rung fails.
- L3 attempts capped per interview by pressure; L3 never begins when remaining_minutes < reserve_minutes + L3 time_budget_minutes, nor in reserve.
- "I don't know" above the bar is evidence of nothing. Honest IDK with a sound process scores >= 2 at or below the bar.

ANCHORED 0-5 SCALE (owned by 03; summarized here because tier pass and 04 aggregation depend on it)
  0 no relevant content / evasion / fundamentally incorrect      1 generic, textbook-only, identical for any employer
  2 one concrete element with important gaps, OR honest IDK/not-my-part/read-not-done with a sound process (calibrated floor)
  3 solid role-appropriate reasoning PLUS at least one anchor (experience mode: owned decision, artifact type with a defect,
    metric with provenance, failure with response, ownership boundary; case mode: specific first action with mechanism,
    explicit assumption, named trade-off with cost, falsifier). A fluent answer with zero personal instance caps at 2.
  4 = 3 plus a cost/confounder acknowledged, ownership boundary drawn, failure chain or disconfirmer, consistent with ledger
  5 = 4 plus self-calibration: names what they did not do, limits, uncertainty; survives callback/mutation with new consistent detail.
  Fluency, structure, STAR completeness, textbook completeness and confidence never satisfy an anchor.

BEDROCK (03 bedrock_reached): >= 2 of {a decision the candidate made, a named artifact type with a defect, a number with its source,
  a role interacted with, a duration/date, a failure with what was done}. Two consecutive honest floors (each with process, rule 14.8)
  also end the drill and set bedrock_reached with bedrock_basis: honest_floors; that basis never yields verification_status supported
  or evidence_grade specific_with_verification_detail (04 reads bedrock_basis before treating bedrock as verification).
```

---

## 16. Pressure-level semantics

`pressure_level` is a property of the requisition, set by the hiring team with a written job-relatedness rationale (required for `intense`), frozen at blueprint time, stored in the version bundle, shown in the report. It changes *how many* and *how fast*, never *how* (tone, courtesy, fairness, rubric). Nothing observed during an interview changes it for that candidate.

| Knob | calm | standard | intense |
|---|---|---|---|
| `probe_budget_base` | 1 | 2 | 3 |
| `probe_hard_cap_per_question` | 3 | 4 | 4 |
| `interview_probe_pool_factor` | 1.25 | 1.5 | 1.75 |
| `callbacks_max` | 1 | 2 | 3 |
| `reconciliations_max` | 1 | 2 | 3 |
| `premises_max` | 0 | 1 | 2 |
| `mutations_per_case_max` | 1 | 2 | 3 |
| `l3_attempts_per_interview_max` | 1 | 2 | 3 |
| `ladder_policy` | to_bar | bar_plus_one | until_ceiling |
| `non_linear_entry_share` | 0 | 0.5 | 1.0 |
| `anchor_first_on_resume_claims` | false | true | true |
| `behavioral_boost_max` | 0 | 1 | 1 |
| METRIC parts per probe | 1 | 1 | 1 (2 coupled parts allowed) |
| Pace instruction to 02 | One topic-level probe before descending. | Descend to the specific decision within the first probe. | Descend within the first probe; after L2 passed prefer MUTATE or DISCONFIRM; callback every high-materiality ownership claim. |
| Opening script | Standard disclosure + one extra reassurance sentence | Standard disclosure | Standard disclosure |

**Identical at every level:** persona and allowed acknowledgements, banned phrases, fairness and protected-trait rules, scoring rubric (scores comparable across levels), reserve protection (`reserve_minutes = max(0.10 x duration_minutes, 4)`), `max_answer_seconds` 180 (240 case), candidate rights, accommodation handling, one-question rule, non-scoring of behavior, one callback per claim, one reconciliation per pair, one mutation per constraint family per case (count capped by `mutations_per_case_max`), one reframe per rung. Suggested defaults: `calm` for intern/fresher cohorts and `mock_practice`; `standard` for junior/mid hiring; `intense` for senior/lead roles where real-time challenge is part of the job.

```text
time_pressure_mode (server clock only; the client never computes it)
  reserve : remaining_minutes <= reserve_minutes
  tight   : not reserve AND (remaining_minutes - reserve_minutes) < sum(time_budget_minutes of unfinished planned main questions)
  normal  : otherwise
  hard stop at duration_minutes + 2 (forced candidate_questions then closing); auto-submit at max_answer_seconds with a 10 s warning;
  neutral silence prompt after 8 s of silence ("Take your time.").
```

---

## 17. `candidate_turn_dto` (the ONLY object the candidate client ever receives)

```json
{
  "turn_index": "integer",
  "turn_type": "enum:dto_turn_type (backend maps callback | constraint_mutation | ladder_step | reframe | reconciliation | clarification_reveal -> follow_up)",
  "candidate_message": "string",
  "requires_answer": "boolean",
  "max_answer_seconds": "integer",
  "can_request_clarification": "boolean",
  "phase_label": "enum:phase_label"
}
```

Built by an explicit allowlist serializer; contract-tested to have exactly these seven keys; delivered on a channel separate from the reviewer channel; the client bundle contains no evaluator, blueprint, ledger or signal types. `candidate_message` from 02 is the only model text ever rendered, and only after passing the H8 output guard (§18).

---

## 18. Persona lexicon, banned phrases, prohibited vocabulary, protected-trait lexicon

```text
ALLOWED ACKNOWLEDGEMENTS (candidate_message may open with at most one, <= 4 words, optional; identical after strong, weak and IDK answers)
  Okay.  |  Understood.  |  Noted.  |  Thank you.  |  Let's continue.  |  Moving on.  |  One more on that.
  Take your time.   (only after a break/pause request, or a long_pause attention flag paired with an offer to rephrase)

FIXED NEUTRAL LINES (02 copies scripts.<key> verbatim — never composes or translates; the backend scripts table (§19) holds the
  interview_language text. English source shown.)
  validation-seeking ("is that what you wanted?") -> scripts.no_single_expected_answer_line
                                                     "There is no single expected answer. Answer in whatever way reflects what you actually did."
  after "I don't know"                            -> scripts.idk_ack "Understood." + one REFRAME at the same rung (if unused), else move on
  after a correction                              -> scripts.correction_line "Noted. With that version, how does the decision change?" (or simply proceed)
  hidden-info request                             -> scripts.hidden_info_line "I can't share evaluation details." + repeat/narrow the question
  hint request                                    -> scripts.hint_line "Take it in whatever direction you think is right." + repeat the question
  skip request                                    -> scripts.skip_line "We can come back to it." + next question (backend marks skipped_by_candidate)
  accommodation request                           -> scripts.accommodation_line "Of course. [CHANGE] Would you like me to repeat the question?"
                                                     ([CHANGE] = one plain sentence stating what changes; the only slot 02 fills)
  confidentiality cited                           -> scripts.confidentiality_line "No need for the actual names or figures; describe the shape of it."
                                                     (once per item; then accept ONLY a shape-level answer — order of magnitude, direction, mechanism;
                                                      02 rule 7.3 and 03 candid_signal confidentiality_with_shape apply the same content test; a bare
                                                      "I can't say" closes the item as withheld_confidential without penalty and without a second ask)
  reconciliation (fixed form)                     -> neutral restatement of quote A; neutral restatement of quote B; scripts.reconciliation_join_line
                                                     "Help me put those together."
  Any other fixed line 02 needs (assume, go-ahead, break/resume, rephrase offer, another question, unknown answer, escalate) exists as a
  scripts key in §19. 02 has NO literal English strings of its own.

BANNED IN candidate_message (backend regex, H8; violation -> regenerate, max 2 retries, then verbatim blueprint fallback)
  evaluation/praise : great, good, excellent, perfect, exactly, correct, right (as evaluation), nice, interesting, impressive, makes sense,
                      thanks for sharing, I appreciate, good point, well said, well explained, absolutely, definitely, love that, fantastic,
                      awesome, helpful, clear answer, good to know, spot on, that's what I was looking for
  consolation/react : that's okay, that's fine, no worries, don't worry, hmm, not quite, are you sure, really?, wow, I see (as reaction)
  claim-testing     : verify, verified, confirm (about claims), check (about claims), prove, claim, claimed, contradiction, inconsistent,
                      "earlier you said", "you said", "you mentioned earlier ... but"
  delivery/source   : AI, ChatGPT, notes, reading, screen, script, rehearsed, generic, prepared, pause, hesitat-, nervous, gaze, eye contact, speech
                      (JD-term exemption: a word in this row that appears verbatim in role_summary.jd_key_phrases or the verbatim main question
                       is allowed in that sense only, e.g. "screen" for a screening role, "script" for a call-centre role, "AI" for an ML role)
  process           : score, rubric, flag, probe, budget, escalat-, evaluation, "let's try something easier"
  leading           : "Don't you think", "Wouldn't it be better to", "Did you use X"
  generic probes    : "tell me more", "can you elaborate", "be more specific"   (a probe must name the boundary it wants)
  plus every protected-trait term below.

PROHIBITED IN EVERY HIDDEN OUTPUT FIELD (02 hidden_turn_note, 03, 04; backend blocklist, H10; violation -> regenerate)
  lie, lied, liar, dishonest, deceptive, fabricated, false (as a claim label), exaggerated, inflated, bluff, bluffing, cheating, suspicious,
  evasive, red flag (about the person), AI-generated, likely used AI, read from a screen, scripted (about the person), rehearsed,
  taking credit, nervous, confident/unconfident (as a trait), arrogant, unprofessional, culture fit,
  memorized, memorised, recited, canned, coached, generated (about the answer), copy-pasted, prepared answer, genuine, not genuine, authentic, real experience (as a judgment).
  In SCORED fields additionally: hesitat-, pause, gaze, fluent, fluency, stammer, pace, latency, filler.
  Every term in this list appears in 02 §10.4, 03 §2.3 and 04 §2.5 (CI checks term coverage; a file may add stricter terms of its own). EXEMPT from the blocklist: closed enum values
  (e.g. answer_style_flag `scripted_structure`, pattern ids B01-B24) and the permitted status vocabulary below; the blocklist runs on
  free-text fields only.
  Permitted status vocabulary (U11): untested, probed, supported, partially supported, unsupported after probing, unanchored,
  possible conflict / clear conflict (always with both quotes), revised by candidate, withheld as confidential, not their scope.
  Design shorthand "bluff pattern" never appears in any output; the output vocabulary is "evidence-quality pattern" (pattern_flags).

PROTECTED-TRAIT LEXICON (never asked, inferred, stored, followed up if volunteered, or used in any field; India-specific items mandatory)
  age, date of birth, gender, gender identity, sex, sexual orientation, transgender status, marital status, pregnancy, family plans, children,
  caregiving, religion, caste, community, tribe, race, colour, ethnicity, mother tongue, language spoken at home, region/place of birth,
  descent, nationality, citizenship, migration status, disability, health, HIV status, genetic information, mental health, appearance,
  accent, socioeconomic background, veteran status, criminal history, political opinion, union membership.
  Proxies also barred: photo, name- or surname-derived inferences, college as prestige proxy, school medium of instruction, address or
  neighbourhood, career gaps framed to elicit personal reasons, voice-derived inferences. "Explain the gap" is never asked. Failure probes never touch health, family, personal circumstances,
  identity-related conflict, performance reviews or disciplinary outcomes.
```

---

## 19. Fixed scripts (backend-authored; 02 copies `session_state.scripts.<key>` verbatim, never composes or translates)

Every key below is a required string in `session_state.scripts` (§6). The backend serves the `interview_language` translation; English source text is canonical. 02 may prefix a line with one allowed acknowledgement (§18) where the rule permits, and fills exactly one slot: `[CHANGE]` in `accommodation_line`. No other English literal exists in 02.

```text
KEY                              ENGLISH SOURCE / RULE
opening_disclosure               Rendered by the backend before Q1 (sets candidate_rights_disclosed = true); 02 never re-sends it.
  "Before we begin: this interview is conducted by an AI interviewer. I will mostly ask questions and I will not give feedback or
   reactions to your answers during the interview. That is the same for every candidate and is not a signal about how you are doing.
   At any time you may ask me to repeat or rephrase a question, ask for a short break, tell me if you need any adjustment to how the
   interview runs, or stop. You do not need to name companies or share confidential figures; describe the work in your own words."
  [appended only when behavioral_analysis_consent == true]
  "Audio/video signals are used only to decide which follow-up question to ask next; they are never part of your score."
  [appended only at pressure_level calm]
  "There is no single expected answer to any question; answer from what you actually did or would do."

candidate_questions_opener       "That is the end of my questions. Do you have any questions for me about the role or the company?
                                  I can answer from the information I have been given."
candidate_questions_unknown      "I don't have that information; the recruiting team can answer that."   (role_summary + company_context lack it)
another_question                 "Do you have another question?"                                          (only while remaining_minutes > 1)
questions_later_line             "We will have time for your questions at the end."                       (role/company question asked during phase main)
closing                          "Thank you for your time today. The recruiting team will contact you about next steps. This ends the interview."
escalate_closing                 "Thank you. We will pause the interview here and a member of the team will follow up with you directly."
                                 (stop request, distress, accommodation_unavailable incl. code human_interviewer; requires_answer false)

no_single_expected_answer_line   "There is no single expected answer. Answer in whatever way reflects what you actually did."
idk_ack                          "Understood."
correction_line                  "Noted. With that version, how does the decision change?"
hidden_info_line                 "I can't share evaluation details."
hint_line                        "Take it in whatever direction you think is right."
skip_line                        "We can come back to it."
accommodation_line               "Of course. [CHANGE] Would you like me to repeat the question?"
confidentiality_line             "No need for the actual names or figures; describe the shape of it."
reconciliation_join_line         "Help me put those together."

assume_line                      "Assume what you need to and tell me your assumptions."   (clarification matching no fact, or clarifications_asked_count >= 2)
go_ahead_line                    "Go ahead."                                                (after a verbatim fact reveal)
take_your_time                   "Take your time."                                          (break/pause request; also the frontend 8 s silence prompt)
break_resume_line                "Tell me when you are ready to continue."                  (appended to take_your_time on a break request)
rephrase_offer_line              "Take your time. Would you like me to rephrase?"           (the only attention_flag-licensed line; §12.3 (b))

NOT IN scripts (authored elsewhere):
  scenario setup_text always ends with "Ask me for anything you would need to know."  (01 writes it inside the blueprint, in interview_language)
  NEUTRAL BRIDGE LINES (frontend only, after 1.5 s of evaluation latency; identical for all candidates; never vary with flags):
  "Noted."  |  "Let me follow up on one part of that."  |  "Moving to a different area."
```

All scripts are stored in `scripts/intro_and_closing_scripts.json` keyed exactly as above, translated per `interview_language`, version-pinned in the bundle. The H8 banned-phrase guard whitelists the exact script strings.

---

## 20. Cross-file consistency checklist (CI)

```text
- Every enum block embedded in 01-04 is byte-identical to §2 for the enums it names.
- 01 REQUIRED JSON SHAPE == §5; 02 input == §6; 03 input == §7; 04 input == §8; ledger/callback/directive shapes == §9-§11.
- Placeholders in 01-04 are exactly those in the §1 registry; none appear as bare strings inside JSON literals.
- §16 knob table == backend/policy/pressure_levels.json; §14 rules == backend/policy/probe_budget.ts constants.
- §12 envelope schema == contracts/behavioral_signals.schema.json with additionalProperties:false and the denylist; 03/04 payload builders
  have no code path to behavioral stores; score-invariance replay test passes.
- §18 lexicons == backend/guards/{banned_phrases,signal_terms,protected_traits,prohibited_vocabulary}.ts.
- §17 DTO serializer emits exactly seven keys.
- §19 script keys == keys of scripts/intro_and_closing_scripts.json == keys of the §6 scripts object; 02 contains no English literal
  that is not a §19 script or an §18 allowed acknowledgement.
- §12.3 preamble is byte-identical in 02 §8.4; every §18 prohibited-vocabulary term appears in 02 §10.4, 03 §2.3, 04 §2.5 (superset allowed).
- Ladder trigger (CRITICAL = is_must_have OR weight >= 15) is stated identically in §5, §15, 01 §4.3, 01 §7.5; the §9 field-provenance
  table is implemented in backend/ledger/merge.ts.
- Any change to this file bumps contracts_version; any prompt embedding a changed subset bumps its prompt_version.
```
