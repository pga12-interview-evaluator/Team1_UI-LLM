import "server-only";
import { candidateSessionViewSchema, type CandidateSessionView } from "@/lib/api/schemas/candidate";
import {
  finalReportSchema,
  type FinalReport,
  type Requisition,
  type SessionDetail,
  type SessionSummary,
} from "@/lib/api/schemas/console";
import type { RealSession } from "../store";
import { behavioralContext } from "./behavioralReport";
import { disclosureText, versionBundle } from "./orchestrator";
import { duration, planItems } from "./state";

type Dict = Record<string, unknown>;

/** The only object that leaves the candidate channel — parsed with the strict schema before sending. */
export function candidateView(session: RealSession): CandidateSessionView {
  const elapsed = session.started_at
    ? Math.max(0, (Date.now() - new Date(session.started_at).getTime()) / 1000)
    : 0;
  const status =
    session.evaluating && ["active", "candidate_questions"].includes(session.status)
      ? "evaluating"
      : session.status;
  const view = {
    session_id: session.session_id,
    status,
    interview_language: String(session.interview_input.interview_language ?? "en-IN"),
    interview_modality: "both" as const,
    job_title: String(session.interview_input.job_title ?? ""),
    company_display_name: "Interview practice",
    duration_minutes: duration(session),
    opening_disclosure: ["awaiting_consent", "device_check"].includes(session.status)
      ? null
      : disclosureText(session),
    consent: session.consent,
    accommodations_applied: [...session.accommodations],
    current_turn: session.evaluating ? null : session.current_turn,
    elapsed_seconds: Math.round(elapsed),
  };
  return candidateSessionViewSchema.parse(view);
}

const STATUS_MAP: Record<RealSession["status"], SessionSummary["status"]> = {
  awaiting_consent: "invited",
  device_check: "consented",
  ready: "consented",
  disclosed: "active",
  active: "active",
  evaluating: "active",
  paused: "paused",
  candidate_questions: "candidate_questions",
  closed: "closed",
  escalated: "escalated",
};

export function summary(session: RealSession): SessionSummary {
  const started = session.started_at ? new Date(session.started_at).getTime() : null;
  const ended = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  const status = session.report_raw ? "reported" : STATUS_MAP[session.status];
  return {
    session_id: session.session_id,
    requisition_id: String(session.interview_input.requisition_id ?? ""),
    job_title: String(session.interview_input.job_title ?? ""),
    candidate_label: session.candidate_label,
    status,
    pressure_level: session.policy_snapshot.pressure_level as SessionSummary["pressure_level"],
    interview_purpose:
      (session.interview_input.interview_purpose as SessionSummary["interview_purpose"]) ??
      "mock_practice",
    invite_token: session.status === "awaiting_consent" ? session.invite_token : null,
    started_at: session.started_at,
    ended_at: session.ended_at,
    elapsed_minutes: started ? Number(((ended - started) / 60_000).toFixed(1)) : 0,
    questions_asked: new Set(session.evaluations.map((e) => e.question_id)).size,
    questions_planned: planItems(session).filter((i) => i.question_type !== "ladder").length,
    probes_used: session.probes_total,
    escalation_reason: session.escalation_reason,
    accommodation_applied: session.accommodations.length > 0,
    human_decision: session.human_decision?.decision ?? null,
  };
}

export function requisitionOf(session: RealSession): Requisition {
  const input = session.interview_input;
  const blueprint = session.blueprint;
  const competencies = ((blueprint?.competencies as Dict[] | undefined) ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    weight: Number(c.weight ?? 0),
    is_must_have: Boolean(c.is_must_have),
    has_ladder: !!c.ladder,
    start_rung: (["L1", "L2", "L3"].includes(String(c.start_rung))
      ? String(c.start_rung)
      : "L2") as "L1" | "L2" | "L3",
    seniority_bar_rung: (["L1", "L2", "L3"].includes(String(c.seniority_bar_rung))
      ? String(c.seniority_bar_rung)
      : "L2") as "L1" | "L2" | "L3",
  }));
  const control = (blueprint?.interview_control as Dict | undefined) ?? {};
  return {
    requisition_id: String(input.requisition_id),
    status: blueprint ? "frozen" : session.blueprint_error ? "draft" : "blueprint_pending",
    created_at: session.created_at,
    updated_at: session.created_at,
    job_title: String(input.job_title),
    field: String(input.field ?? input.job_title),
    field_family:
      ((blueprint?.role_summary as Dict | undefined)
        ?.field_family as Requisition["field_family"]) ?? null,
    seniority: input.seniority as Requisition["seniority"],
    employment_type: null,
    location_or_market: null,
    interview_language: String(input.interview_language),
    duration_minutes: duration(session),
    interview_style: input.interview_style as Requisition["interview_style"],
    interview_modality: "both",
    interview_purpose:
      (input.interview_purpose as Requisition["interview_purpose"]) ?? "mock_practice",
    pressure_level: session.policy_snapshot.pressure_level as Requisition["pressure_level"],
    pressure_rationale: null,
    job_description: String(input.job_description ?? ""),
    must_have_skills:
      (
        (blueprint?.role_summary as Dict | undefined)?.explicit_requirements as string[] | undefined
      )?.slice(0, 12) ?? [],
    nice_to_have_skills: [],
    company_context: (input.company_context as string | null) ?? null,
    interviewer_constraints: String(input.interviewer_constraints ?? ""),
    blueprint: blueprint
      ? {
          blueprint_version: String(blueprint.blueprint_version ?? "2.1"),
          competencies,
          interview_plan: planItems(session).map((item) => ({
            order: Number(item.order ?? 0),
            question_id: String(item.question_id),
            question_type: String(item.question_type ?? ""),
            candidate_facing_question: String(item.candidate_facing_question ?? ""),
            time_budget_minutes: Number(item.time_budget_minutes ?? 0),
            target_competencies: ((item.target_competencies as unknown[] | undefined) ?? []).map(
              String,
            ),
            probe_count: ((item.probe_plan as unknown[] | undefined) ?? []).length,
          })),
          interview_control: {
            planned_minutes: Number(control.planned_minutes ?? 0),
            candidate_questions_reserve_minutes: Number(
              control.candidate_questions_reserve_minutes ?? 0,
            ),
            minimum_main_questions: Number(control.minimum_main_questions ?? 0),
            maximum_main_questions: Number(control.maximum_main_questions ?? 0),
          },
          self_check: Object.fromEntries(
            Object.entries((blueprint.self_check as Dict | undefined) ?? {}).map(([k, v]) => [
              k,
              typeof v === "boolean" || v === null || Array.isArray(v)
                ? (v as boolean | null | string[])
                : null,
            ]),
          ),
          validation: { passed: true, failures: [] },
        }
      : null,
    session_count: 1,
  };
}

export function detail(session: RealSession): SessionDetail {
  return {
    summary: summary(session),
    transcript: session.transcript.map((t) => ({
      ...t,
      segments: [],
    })) as SessionDetail["transcript"],
    evaluations: session.evaluations,
    budget_audit: session.budget_audit as SessionDetail["budget_audit"],
    accommodations_applied: [...session.accommodations],
    report: session.report_raw ? projectReport(session) : null,
    human_decision: session.human_decision,
    version_bundle: {
      ...versionBundle(),
      gemini_calls: String(session.gemini_log.length),
      blueprint_error: session.blueprint_error ?? "none",
    },
  };
}

/* ---------------- 04 output → console FinalReport (defensive mapping) ---------------- */

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v == null ? fallback : String(v);
const num = (v: unknown, fallback: number | null = null): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const arr = <T>(v: unknown, map: (item: Dict) => T): T[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object").map((x) => map(x as Dict)) : [];
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export function projectReport(session: RealSession): FinalReport {
  const raw = (session.report_raw ?? {}) as Dict;
  const role = (raw.role as Dict | undefined) ?? {};
  const config = (raw.interview_config as Dict | undefined) ?? {};
  const coverage = (raw.evidence_coverage as Dict | undefined) ?? {};
  const nextStep = (raw.recommended_next_step as Dict | undefined) ?? {};
  const ownership = (raw.ownership_profile as Dict | undefined) ?? {};
  const pressure = (raw.pressure_response_summary as Dict | undefined) ?? {};
  const feedback = raw.candidate_feedback as Dict | null | undefined;

  const candidate: FinalReport = {
    report_version: str(raw.report_version, "2.0"),
    session_id: session.session_id,
    role: {
      job_title: str(role.job_title, str(session.interview_input.job_title)),
      field: str(role.field, str(session.interview_input.field)),
      field_family: oneOf(
        role.field_family,
        [
          "software",
          "data_analytics_ds",
          "finance_accounting",
          "sales_marketing",
          "operations_supply",
          "people_hr",
          "general_business",
        ] as const,
        "general_business",
      ),
      seniority: oneOf(
        role.seniority,
        ["intern", "junior", "mid", "senior", "lead", "manager"] as const,
        "mid",
      ),
    },
    interview_config: {
      pressure_level: oneOf(
        config.pressure_level,
        ["calm", "standard", "intense"] as const,
        session.policy_snapshot.pressure_level as "calm",
      ),
      pressure_rationale: null,
      interview_purpose: oneOf(
        config.interview_purpose,
        ["hiring", "mock_practice"] as const,
        "mock_practice",
      ),
      duration_minutes: duration(session),
      interview_language: str(
        config.interview_language,
        str(session.interview_input.interview_language),
      ),
    },
    evidence_coverage: {
      assessed_competency_weight_percent: num(coverage.assessed_competency_weight_percent, 0) ?? 0,
      critical_competencies_with_sufficient_evidence: strs(
        coverage.critical_competencies_with_sufficient_evidence,
      ),
      critical_competencies_needing_more_evidence: strs(
        coverage.critical_competencies_needing_more_evidence,
      ),
      coverage_confidence: oneOf(
        coverage.coverage_confidence,
        ["low", "medium", "high"] as const,
        "low",
      ),
    },
    competency_assessment: arr(raw.competency_assessment, (c) => ({
      competency_id: str(c.competency_id),
      competency_name: str(c.competency_name),
      weight: Math.round(num(c.weight, 0) ?? 0),
      knowledge_depth_score: num(c.knowledge_depth_score),
      confidence: oneOf(c.confidence, ["low", "medium", "high"] as const, "low"),
      evidence_for: arr(c.evidence_for, (e) => ({
        question_id: str(e.question_id),
        quote: str(e.quote),
        observation: str(e.observation),
      })),
      evidence_gap: c.evidence_gap == null ? null : str(c.evidence_gap),
    })),
    overall_weighted_score: num(raw.overall_weighted_score),
    knowledge_ceiling_summary: arr(raw.knowledge_ceiling_summary, (k) => ({
      competency_id: str(k.competency_id),
      demonstrated_up_to: oneOf(k.demonstrated_up_to, ["none", "L1", "L2", "L3"] as const, "none"),
      seniority_bar_rung: oneOf(k.seniority_bar_rung, ["L1", "L2", "L3"] as const, "L2"),
      ceiling_gap: oneOf(
        k.ceiling_gap,
        ["none", "one_tier", "two_tiers", "not_assessed"] as const,
        "not_assessed",
      ),
    })),
    claim_ledger_resolution: arr(raw.claim_ledger_resolution, (c) => ({
      claim_id: str(c.claim_id),
      claim_text: str(c.claim_text ?? c.normalized_statement ?? c.verbatim),
      materiality: oneOf(c.materiality, ["high", "medium", "low"] as const, "medium"),
      final_status: oneOf(
        c.final_status,
        [
          "supported",
          "partially_supported",
          "unresolved_after_probing",
          "not_tested",
          "conflicting_with_quotes",
          "revised_by_candidate",
          "withheld_confidential",
          "not_their_scope",
        ] as const,
        "not_tested",
      ),
      why_unsupported: c.why_unsupported == null ? null : str(c.why_unsupported),
      quotes: strs(c.quotes).slice(0, 2),
      what_probes_yielded: str(c.what_probes_yielded),
    })),
    metric_table: arr(raw.metric_table, (m) => ({
      claim_id: str(m.claim_id),
      headline: str(m.headline),
      parts: Object.fromEntries(
        Object.entries((m.parts as Dict | undefined) ?? {}).map(([k, v]) => [k, str(v)]),
      ),
      metric_status: oneOf(
        m.metric_status,
        ["anchored", "unanchored", "withheld_confidential"] as const,
        "unanchored",
      ),
    })),
    ownership_profile: {
      expected_for_seniority: str(ownership.expected_for_seniority),
      demonstrated_summary: str(ownership.demonstrated_summary),
      honest_down_scopes: arr(ownership.honest_down_scopes, (h) => ({
        claim_id: str(h.claim_id),
        quote: str(h.quote),
      })),
      notes: strs(ownership.notes),
    },
    pattern_summary: arr(raw.pattern_summary, (p) => ({
      pattern: str(p.pattern),
      occurrences: Math.round(num(p.occurrences, 1) ?? 1),
      example_quotes: strs(p.example_quotes).slice(0, 2),
      what_probes_yielded: str(p.what_probes_yielded),
    })),
    candid_signals_summary: arr(raw.candid_signals_summary, (s) => ({
      signal: str(s.signal),
      occurrences: Math.round(num(s.occurrences, 1) ?? 1),
      example_quote: str(s.example_quote),
    })),
    consistency_notes: arr(raw.consistency_notes, (n) => ({
      status: oneOf(
        n.status,
        [
          "possible_conflict",
          "clear_conflict",
          "unresolved_after_reconciliation",
          "clarification_needed",
        ] as const,
        "clarification_needed",
      ),
      references: strs(n.references),
      quote_a: str(n.quote_a),
      quote_b: str(n.quote_b),
      reconciliation_asked: Boolean(n.reconciliation_asked),
      resolution_status: oneOf(
        n.resolution_status,
        ["resolved", "partially_resolved", "unresolved", "not_asked"] as const,
        "not_asked",
      ),
      neutral_resolution_question: str(n.neutral_resolution_question),
    })),
    pressure_response_summary: {
      narrative: str(pressure.narrative),
      specificity_trend_by_question: arr(pressure.specificity_trend_by_question, (t) => ({
        question_id: str(t.question_id),
        direction: oneOf(
          t.direction,
          ["increasing", "flat", "decreasing", "not_applicable"] as const,
          "not_applicable",
        ),
      })),
    },
    demonstrated_strengths: strs(raw.demonstrated_strengths),
    material_gaps_or_risks: strs(raw.material_gaps_or_risks),
    unverified_claims: strs(raw.unverified_claims),
    recommendation: oneOf(
      raw.recommendation,
      [
        "strong_positive_signal",
        "positive_signal_with_follow_up",
        "mixed_signal",
        "insufficient_evidence",
        "concern_signal",
      ] as const,
      "insufficient_evidence",
    ),
    recommendation_rationale: str(raw.recommendation_rationale),
    recommended_next_step: {
      type: oneOf(
        nextStep.type,
        [
          "human_review",
          "focused_follow_up_interview",
          "work_sample",
          "reference_check",
          "none",
        ] as const,
        "human_review",
      ),
      purpose: str(nextStep.purpose),
      targeted_questions_or_criteria: strs(nextStep.targeted_questions_or_criteria),
    },
    human_reviewer_notes: strs(raw.human_reviewer_notes),
    coverage_limitations: strs(raw.coverage_limitations),
    candidate_feedback: feedback
      ? {
          note: str(feedback.note, "Practice feedback only; not a hiring assessment."),
          strengths_in_plain_language: strs(feedback.strengths_in_plain_language),
          practice_suggestions: strs(feedback.practice_suggestions),
        }
      : null,
    non_scored_behavioral_context: behavioralContext(session),
  };
  return finalReportSchema.parse(candidate);
}
