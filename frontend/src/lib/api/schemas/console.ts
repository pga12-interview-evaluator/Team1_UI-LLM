import { z } from "zod";
import { accommodationCodeSchema } from "./candidate";

/**
 * Reviewer/recruiter console contracts. Field names follow prompts_v2/00_shared_contracts.md
 * (interview_input §3, enums §2) and the 04 report shape. These payloads travel on the
 * authenticated console channel only and never reach the candidate client.
 */

export const pressureLevelSchema = z.enum(["calm", "standard", "intense"]);
export const interviewPurposeSchema = z.enum(["hiring", "mock_practice"]);
export const senioritySchema = z.enum(["intern", "junior", "mid", "senior", "lead", "manager"]);
export const fieldFamilySchema = z.enum([
  "software",
  "data_analytics_ds",
  "finance_accounting",
  "sales_marketing",
  "operations_supply",
  "people_hr",
  "general_business",
]);
export const interviewStyleSchema = z.enum(["technical", "case", "behavioral", "mixed"]);
export const interviewModalityInputSchema = z.enum(["voice", "text", "both"]);

export type PressureLevel = z.infer<typeof pressureLevelSchema>;
export type Seniority = z.infer<typeof senioritySchema>;
export type FieldFamily = z.infer<typeof fieldFamilySchema>;

export const requisitionStatusSchema = z.enum([
  "draft",
  "blueprint_pending",
  "blueprint_review",
  "frozen",
  "archived",
]);
export type RequisitionStatus = z.infer<typeof requisitionStatusSchema>;

export const requisitionBaseSchema = z.object({
  job_title: z.string().min(2).max(120),
  field: z.string().min(2).max(120),
  field_family: fieldFamilySchema.nullable(),
  seniority: senioritySchema,
  employment_type: z.string().max(60).nullable(),
  location_or_market: z.string().max(120).nullable(),
  interview_language: z.string().min(2).max(12),
  duration_minutes: z.number().int().min(20).max(90),
  interview_style: interviewStyleSchema,
  interview_modality: interviewModalityInputSchema,
  interview_purpose: interviewPurposeSchema,
  pressure_level: pressureLevelSchema,
  pressure_rationale: z.string().max(600).nullable(),
  job_description: z.string().min(50).max(20_000),
  must_have_skills: z.array(z.string().min(1).max(80)).min(1).max(12),
  nice_to_have_skills: z.array(z.string().min(1).max(80)).max(12),
  company_context: z.string().max(4000).nullable(),
  interviewer_constraints: z.string().max(1000).nullable(),
});

export const requisitionInputSchema = requisitionBaseSchema.superRefine((value, ctx) => {
  if (value.pressure_level === "intense" && !value.pressure_rationale?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pressure_rationale"],
      message: "A written job-relatedness rationale is required for intense pressure.",
    });
  }
});
export type RequisitionInput = z.infer<typeof requisitionInputSchema>;

export const blueprintSummarySchema = z.object({
  blueprint_version: z.string(),
  competencies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      weight: z.number().int(),
      is_must_have: z.boolean(),
      has_ladder: z.boolean(),
      start_rung: z.enum(["L1", "L2", "L3"]),
      seniority_bar_rung: z.enum(["L1", "L2", "L3"]),
    }),
  ),
  interview_plan: z.array(
    z.object({
      order: z.number().int(),
      question_id: z.string(),
      question_type: z.string(),
      candidate_facing_question: z.string(),
      time_budget_minutes: z.number(),
      target_competencies: z.array(z.string()),
      probe_count: z.number().int(),
    }),
  ),
  interview_control: z.object({
    planned_minutes: z.number(),
    candidate_questions_reserve_minutes: z.number(),
    minimum_main_questions: z.number().int(),
    maximum_main_questions: z.number().int(),
  }),
  self_check: z.record(z.string(), z.union([z.boolean(), z.null(), z.array(z.string())])),
  validation: z.object({
    passed: z.boolean(),
    failures: z.array(z.string()),
  }),
});
export type BlueprintSummary = z.infer<typeof blueprintSummarySchema>;

export const requisitionSchema = requisitionBaseSchema.extend({
  requisition_id: z.string(),
  status: requisitionStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  blueprint: blueprintSummarySchema.nullable(),
  session_count: z.number().int().nonnegative(),
});
export type Requisition = z.infer<typeof requisitionSchema>;

export const sessionStatusSchema = z.enum([
  "invited",
  "consented",
  "active",
  "paused",
  "candidate_questions",
  "closed",
  "escalated",
  "reported",
]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const sessionSummarySchema = z.object({
  session_id: z.string(),
  requisition_id: z.string(),
  job_title: z.string(),
  candidate_label: z.string(), // pseudonymous label; the console never needs a name to review
  status: sessionStatusSchema,
  pressure_level: pressureLevelSchema,
  interview_purpose: interviewPurposeSchema,
  invite_token: z.string().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  elapsed_minutes: z.number().nonnegative(),
  questions_asked: z.number().int().nonnegative(),
  questions_planned: z.number().int().nonnegative(),
  probes_used: z.number().int().nonnegative(),
  escalation_reason: z.string().nullable(),
  accommodation_applied: z.boolean(),
  human_decision: z.string().nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const transcriptEntrySchema = z.object({
  turn_index: z.number().int(),
  role: z.enum(["interviewer", "candidate", "system"]),
  question_id: z.string().nullable(),
  answer_id: z.string().nullable(),
  turn_type: z.string().nullable(),
  technique: z.string().nullable(),
  target_claim_ids: z.array(z.string()),
  probe_index: z.number().int().nullable(),
  ladder_rung: z.enum(["L1", "L2", "L3"]).nullable(),
  is_callback: z.boolean(),
  text: z.string(),
  committed_at: z.string(),
  source: z.enum(["model", "cache", "fallback", "fast_path", "script", "candidate"]),
});
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;

export const evaluationSummarySchema = z.object({
  question_id: z.string(),
  answer_id: z.string(),
  competency_scores: z.array(
    z.object({
      competency_id: z.string(),
      score: z.number().int().min(0).max(5),
      evidence_grade: z.enum(["none", "generic", "specific", "specific_with_verification_detail"]),
      evidence: z.array(z.string()),
      missing_evidence: z.array(z.string()),
    }),
  ),
  pattern_flags: z.array(
    z.object({ pattern: z.string(), quote: z.string(), severity: z.number().int().min(1).max(3) }),
  ),
  candid_signals: z.array(z.object({ signal: z.string(), quote: z.string() })),
  probe_directives: z.array(
    z.object({ rank: z.number().int(), technique: z.string(), suggested_wording: z.string() }),
  ),
  recommended_next_action: z.string(),
  question_digest: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reviewer_flags: z.array(z.string()),
});
export type EvaluationSummary = z.infer<typeof evaluationSummarySchema>;

export const budgetAuditRowSchema = z.object({
  answer_id: z.string(),
  pattern_weight: z.number(),
  distinct_moderate: z.number().int(),
  evidence_grade: z.string(),
  content_escalation: z.boolean(),
  attention_boost: z.boolean(),
  base: z.number().int(),
  cap: z.number().int(),
  pool_before: z.number().int(),
  pool_after: z.number().int(),
  model_recommendation: z.string(),
  backend_decision: z.string(),
  override_reason: z.string().nullable(),
});
export type BudgetAuditRow = z.infer<typeof budgetAuditRowSchema>;

export const recommendationSchema = z.enum([
  "strong_positive_signal",
  "positive_signal_with_follow_up",
  "mixed_signal",
  "insufficient_evidence",
  "concern_signal",
]);
export type Recommendation = z.infer<typeof recommendationSchema>;

export const finalReportSchema = z.object({
  report_version: z.string(),
  session_id: z.string(),
  role: z.object({
    job_title: z.string(),
    field: z.string(),
    field_family: fieldFamilySchema,
    seniority: senioritySchema,
  }),
  interview_config: z.object({
    pressure_level: pressureLevelSchema,
    pressure_rationale: z.string().nullable(),
    interview_purpose: interviewPurposeSchema,
    duration_minutes: z.number().int(),
    interview_language: z.string(),
  }),
  evidence_coverage: z.object({
    assessed_competency_weight_percent: z.number(),
    critical_competencies_with_sufficient_evidence: z.array(z.string()),
    critical_competencies_needing_more_evidence: z.array(z.string()),
    coverage_confidence: z.enum(["low", "medium", "high"]),
  }),
  competency_assessment: z.array(
    z.object({
      competency_id: z.string(),
      competency_name: z.string(),
      weight: z.number().int(),
      knowledge_depth_score: z.number().nullable(),
      confidence: z.enum(["low", "medium", "high"]),
      evidence_for: z.array(
        z.object({ question_id: z.string(), quote: z.string(), observation: z.string() }),
      ),
      evidence_gap: z.string().nullable(),
    }),
  ),
  overall_weighted_score: z.number().nullable(),
  knowledge_ceiling_summary: z.array(
    z.object({
      competency_id: z.string(),
      demonstrated_up_to: z.enum(["none", "L1", "L2", "L3"]),
      seniority_bar_rung: z.enum(["L1", "L2", "L3"]),
      ceiling_gap: z.enum(["none", "one_tier", "two_tiers", "not_assessed"]),
    }),
  ),
  claim_ledger_resolution: z.array(
    z.object({
      claim_id: z.string(),
      claim_text: z.string(),
      materiality: z.enum(["high", "medium", "low"]),
      final_status: z.enum([
        "supported",
        "partially_supported",
        "unresolved_after_probing",
        "not_tested",
        "conflicting_with_quotes",
        "revised_by_candidate",
        "withheld_confidential",
        "not_their_scope",
      ]),
      why_unsupported: z.string().nullable(),
      quotes: z.array(z.string()),
      what_probes_yielded: z.string(),
    }),
  ),
  metric_table: z.array(
    z.object({
      claim_id: z.string(),
      headline: z.string(),
      parts: z.record(z.string(), z.string()),
      metric_status: z.enum(["anchored", "unanchored", "withheld_confidential"]),
    }),
  ),
  ownership_profile: z.object({
    expected_for_seniority: z.string(),
    demonstrated_summary: z.string(),
    honest_down_scopes: z.array(z.object({ claim_id: z.string(), quote: z.string() })),
    notes: z.array(z.string()),
  }),
  pattern_summary: z.array(
    z.object({
      pattern: z.string(),
      occurrences: z.number().int(),
      example_quotes: z.array(z.string()),
      what_probes_yielded: z.string(),
    }),
  ),
  candid_signals_summary: z.array(
    z.object({ signal: z.string(), occurrences: z.number().int(), example_quote: z.string() }),
  ),
  consistency_notes: z.array(
    z.object({
      status: z.enum([
        "possible_conflict",
        "clear_conflict",
        "unresolved_after_reconciliation",
        "clarification_needed",
      ]),
      references: z.array(z.string()),
      quote_a: z.string(),
      quote_b: z.string(),
      reconciliation_asked: z.boolean(),
      resolution_status: z.enum(["resolved", "partially_resolved", "unresolved", "not_asked"]),
      neutral_resolution_question: z.string(),
    }),
  ),
  pressure_response_summary: z.object({
    narrative: z.string(),
    specificity_trend_by_question: z.array(
      z.object({
        question_id: z.string(),
        direction: z.enum(["increasing", "flat", "decreasing", "not_applicable"]),
      }),
    ),
  }),
  demonstrated_strengths: z.array(z.string()),
  material_gaps_or_risks: z.array(z.string()),
  unverified_claims: z.array(z.string()),
  recommendation: recommendationSchema,
  recommendation_rationale: z.string(),
  recommended_next_step: z.object({
    type: z.enum([
      "human_review",
      "focused_follow_up_interview",
      "work_sample",
      "reference_check",
      "none",
    ]),
    purpose: z.string(),
    targeted_questions_or_criteria: z.array(z.string()),
  }),
  human_reviewer_notes: z.array(z.string()),
  coverage_limitations: z.array(z.string()),
  candidate_feedback: z
    .object({
      note: z.string(),
      strengths_in_plain_language: z.array(z.string()),
      practice_suggestions: z.array(z.string()),
    })
    .nullable(),
  /** Backend-injected. Non-scored. Rendered last, collapsed, under the fixed disclaimer. */
  non_scored_behavioral_context: z
    .object({
      disclaimer: z.string(),
      capture_status: z.enum([
        "full",
        "partial",
        "none",
        "disabled_by_accommodation",
        "disabled_by_consent",
      ]),
      coverage: z.object({
        answers_with_signals: z.number().int(),
        answers_partial: z.number().int(),
        answers_without: z.number().int(),
      }),
      flags_by_answer: z.array(
        z.object({
          answer_id: z.string(),
          question_id: z.string(),
          flags: z.array(
            z.object({
              flag: z.string(),
              strength: z.enum(["low", "med", "high"]),
              influenced: z.enum(["none", "probe_order", "technique", "budget_boost"]),
              resolved_by_probe: z.boolean().nullable(),
              resolution_note: z.string().nullable(),
            }),
          ),
        }),
      ),
      integrity_events: z
        .array(z.object({ type: z.string(), answer_id: z.string(), duration_ms: z.number().int() }))
        .default([]),
      environment_quality_summary: z.string().default(""),
      producer_versions: z.array(z.string()).default([]),
      used_in_scoring: z.literal(false),
      shown_by_default: z.literal(false),
    })
    .nullable(),
});
export type FinalReport = z.infer<typeof finalReportSchema>;

export const humanDecisionSchema = z.object({
  decision: z.enum(["advance", "hold", "additional_evaluation", "decline", "no_decision"]),
  reason: z.string().min(10).max(2000),
  reviewer_id: z.string().min(1),
  recorded_at: z.string(),
});
export type HumanDecision = z.infer<typeof humanDecisionSchema>;

export const humanDecisionInputSchema = humanDecisionSchema.omit({
  recorded_at: true,
  reviewer_id: true,
});
export type HumanDecisionInput = z.infer<typeof humanDecisionInputSchema>;

export const sessionDetailSchema = z.object({
  summary: sessionSummarySchema,
  transcript: z.array(transcriptEntrySchema),
  evaluations: z.array(evaluationSummarySchema),
  budget_audit: z.array(budgetAuditRowSchema),
  accommodations_applied: z.array(accommodationCodeSchema),
  report: finalReportSchema.nullable(),
  human_decision: humanDecisionSchema.nullable(),
  version_bundle: z.record(z.string(), z.string()),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  session_id: z.string().nullable(),
  kind: z.enum([
    "guard_violation",
    "state_update_rejected",
    "budget_decision",
    "schema_repair",
    "escalation",
    "consent",
    "accommodation",
    "human_decision",
    "login",
  ]),
  detail: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const consoleUserSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  role: z.enum(["recruiter", "reviewer", "admin"]),
});
export type ConsoleUser = z.infer<typeof consoleUserSchema>;

export const listResponse = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), total: z.number().int().nonnegative() });

export const inviteResponseSchema = z.object({
  session_id: z.string(),
  invite_token: z.string(),
  invite_url: z.string(),
});
export type InviteResponse = z.infer<typeof inviteResponseSchema>;
