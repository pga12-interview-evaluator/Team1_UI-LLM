import "server-only";
import type { RealSession } from "../store";
import { scriptsFor } from "./policy";

type Dict = Record<string, unknown>;

export function planItems(session: RealSession): Dict[] {
  const plan = (session.blueprint?.interview_plan as Dict[] | undefined) ?? [];
  return [...plan].sort((a, b) => Number(a.order) - Number(b.order));
}

export function currentItem(session: RealSession): Dict | null {
  return (
    planItems(session).find((item) => item.question_id === session.current_question_id) ?? null
  );
}

/** Next unfinished main question 02 may ask (ladder items are delivered only through S6, which we do not run). */
export function nextItem(session: RealSession): Dict | null {
  return (
    planItems(session).find(
      (item) =>
        !session.completed_question_ids.includes(String(item.question_id)) &&
        !session.skipped_question_ids.includes(String(item.question_id)) &&
        item.question_type !== "ladder" &&
        !item.ladder_ref,
    ) ?? null
  );
}

export function elapsedMinutes(session: RealSession): number {
  if (!session.started_at) return 0;
  return (Date.now() - new Date(session.started_at).getTime()) / 60_000;
}

export function duration(session: RealSession): number {
  return Number(
    session.interview_input.effective_duration_minutes ??
      session.interview_input.duration_minutes ??
      45,
  );
}

export function reserveMinutes(session: RealSession): number {
  return Math.max(0.1 * duration(session), 4);
}

export function timePressureMode(session: RealSession): "normal" | "tight" | "reserve" {
  const remaining = duration(session) - elapsedMinutes(session);
  if (remaining <= reserveMinutes(session)) return "reserve";
  const unfinished = planItems(session).filter(
    (item) =>
      !session.completed_question_ids.includes(String(item.question_id)) &&
      !session.skipped_question_ids.includes(String(item.question_id)) &&
      item.question_type !== "ladder",
  );
  const needed = unfinished.reduce((sum, item) => sum + Number(item.time_budget_minutes ?? 0), 0);
  return remaining - reserveMinutes(session) < needed ? "tight" : "normal";
}

export function relevantCompetencies(session: RealSession, item: Dict | null): Dict[] {
  const all = (session.blueprint?.competencies as Dict[] | undefined) ?? [];
  const ids = new Set((item?.target_competencies as string[] | undefined) ?? []);
  const picked = all.filter((c) => ids.has(String(c.id)));
  return picked.length ? picked : all.slice(0, 2);
}

export function linkedClaims(session: RealSession, item: Dict | null): Dict[] {
  const all = (session.blueprint?.resume_claims as Dict[] | undefined) ?? [];
  const ids = new Set((item?.linked_resume_claim_ids as string[] | undefined) ?? []);
  return all.filter((claim) => ids.has(String(claim.id)));
}

function recentTurns(session: RealSession) {
  const current = session.current_question_id;
  const turns = session.transcript;
  const ofCurrent = turns.filter((t) => t.question_id === current);
  const previousQ = [...turns]
    .reverse()
    .find((t) => t.question_id && t.question_id !== current)?.question_id;
  const ofPrevious = previousQ ? turns.filter((t) => t.question_id === previousQ).slice(-2) : [];
  return [...ofPrevious, ...ofCurrent].map((t) => ({ ...t, segments: [] }));
}

/** 00 §6 session_state for Prompt 02. */
export function buildSessionState(
  session: RealSession,
  latestAnswer: string | null,
  ledgerCompact: Dict[],
) {
  const blueprint = session.blueprint ?? {};
  const competencies = ((blueprint.competencies as Dict[] | undefined) ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
    is_must_have: c.is_must_have,
    start_rung: c.start_rung,
    seniority_bar_rung: c.seniority_bar_rung,
  }));
  const resumeClaims = ((blueprint.resume_claims as Dict[] | undefined) ?? []).map((r) => ({
    id: r.id,
    verbatim: r.verbatim,
    claim_type: r.claim_type,
    materiality: r.materiality,
    primary_question_id: r.primary_question_id,
  }));
  const remaining = Math.max(0, duration(session) - elapsedMinutes(session));
  const mode = timePressureMode(session);
  const language = String(session.interview_input.interview_language ?? "en-IN");
  return {
    schema_version: "session_state/2.0",
    session_id: session.session_id,
    phase: session.phase,
    time_pressure_mode: mode,
    elapsed_minutes: Number(elapsedMinutes(session).toFixed(2)),
    remaining_minutes: Number(remaining.toFixed(2)),
    pressure_level: session.policy_snapshot.pressure_level,
    policy_snapshot: session.policy_snapshot,
    interview_purpose: session.interview_input.interview_purpose,
    interview_language: language,
    accommodation_applied: session.accommodations.length > 0,
    candidate_rights_disclosed: true,
    role_summary: blueprint.role_summary ?? {},
    competencies,
    interview_plan: planItems(session),
    resume_claims_compact: resumeClaims,
    current_question_id: session.current_question_id,
    current_answer_id: session.current_question_id
      ? `A_${session.current_question_id}_${session.probe_index}`
      : null,
    completed_question_ids: session.completed_question_ids,
    skipped_by_candidate_question_ids: session.skipped_question_ids,
    probe_index_for_current_question: session.probe_index,
    probe_budget_remaining_for_question: session.probe_budget_remaining,
    probe_budget_reason: session.probe_budget_reason,
    interview_probe_pool_remaining: session.probe_pool_remaining,
    reframe_used_for_current_rung: session.reframe_used,
    evaluator_directives: session.evaluator_directives,
    ladder_instruction: null,
    callback_due: null,
    callbacks_remaining: session.callbacks_remaining,
    reconciliation_due: null,
    reconciliations_remaining: session.reconciliations_remaining,
    premises_remaining: session.premises_remaining,
    l3_attempts_remaining: 0,
    mutations_used_for_current_question: session.mutations_used,
    case_state: currentItem(session)?.scenario ? (session.case_state ?? emptyCaseState()) : null,
    ledger_compact: ledgerCompact.slice(0, 12),
    transcript_digest: session.digests.slice(-8),
    recent_turns: recentTurns(session),
    latest_candidate_answer: latestAnswer,
    company_context:
      session.phase === "candidate_questions"
        ? (session.interview_input.company_context ?? null)
        : null,
    scripts: scriptsFor(language),
  };
}

export function emptyCaseState() {
  return {
    revealed_fact_ids: [],
    clarifications_asked_count: 0,
    candidate_choice_summary: null,
    stated_assumptions: [],
  };
}

/** 00 §7 assessment_input for Prompt 03. */
export function buildAssessmentInput(
  session: RealSession,
  answer: { text: string; answer_id: string },
  askedTurn: {
    text: string;
    turn_type: string;
    technique: string;
    source: string;
    directive: Dict | null;
  },
  ledger: Dict[],
) {
  const item = currentItem(session);
  const blueprint = session.blueprint ?? {};
  return {
    schema_version: "assessment_input/2.0",
    session_id: session.session_id,
    question_id: session.current_question_id,
    answer_id: answer.answer_id,
    seniority: session.interview_input.seniority,
    pressure_level: session.policy_snapshot.pressure_level,
    time_pressure_mode: timePressureMode(session),
    interview_purpose: session.interview_input.interview_purpose,
    interview_language: session.interview_input.interview_language,
    accommodation_applied: session.accommodations.length > 0,
    role_summary: blueprint.role_summary ?? {},
    relevant_competencies: relevantCompetencies(session, item),
    blueprint_question: item,
    linked_resume_claims: linkedClaims(session, item),
    asked_turn: {
      text: askedTurn.text,
      turn_type: askedTurn.turn_type,
      technique: askedTurn.technique,
      asked_question_source: askedTurn.source,
      ladder_rung: null,
      mutation_id: null,
      premise_used: false,
      callback_context: null,
      reconciliation_context: null,
      directive_executed: askedTurn.directive,
    },
    candidate_answer: answer.text,
    probes_used_this_question: session.probe_index,
    probe_budget_remaining: session.probe_budget_remaining,
    ladder_state_for_competency: {
      current_rung: null,
      highest_rung_passed: "none",
      reframe_used: false,
    },
    case_state: item?.scenario ? (session.case_state ?? emptyCaseState()) : null,
    claim_ledger: ledger.slice(-40),
    transcript_digest: session.digests.slice(-8),
    recent_turns: recentTurns(session),
    plausibility_bands:
      ((blueprint.role_summary as Dict | undefined)?.plausibility_bands as Dict[] | undefined) ??
      [],
  };
}

/** 00 §14 probe budget rules, applied after each 03 result. Returns the audit row. */
export function applyBudgetRules(session: RealSession, evaluation: Dict, answerId: string) {
  const policy = session.policy_snapshot as {
    probe_budget_base: number;
    probe_hard_cap_per_question: number;
  };
  const flags =
    (evaluation.pattern_flags as
      { severity?: number; pattern?: string; basis?: string }[] | undefined) ?? [];
  const candid = (evaluation.candid_signals as unknown[] | undefined) ?? [];
  const grades = (
    (evaluation.competency_scores as { evidence_grade?: string }[] | undefined) ?? []
  ).map((c) => c.evidence_grade ?? "none");
  const rank = { none: 0, generic: 1, specific: 2, specific_with_verification_detail: 3 } as Record<
    string,
    number
  >;
  const best = grades.reduce((acc, g) => (rank[g] > rank[acc] ? g : acc), "none");
  const patternWeight = flags.reduce((sum, f) => sum + Number(f.severity ?? 0), 0);
  const distinctModerate = new Set(
    flags.filter((f) => Number(f.severity ?? 0) >= 2).map((f) => f.pattern),
  ).size;
  const base = policy.probe_budget_base;
  const cap = policy.probe_hard_cap_per_question;
  const alreadyEscalated = session.probe_budget_reason.includes("escalation");
  let escalation = false;
  let remaining = session.probe_budget_remaining;
  let reason = session.probe_budget_reason;
  if (
    !alreadyEscalated &&
    (patternWeight >= 3 || distinctModerate >= 2) &&
    (best === "none" || best === "generic")
  ) {
    const used = session.probe_index;
    const newBudget = Math.min(base + 1, cap);
    remaining = Math.max(remaining, newBudget - used);
    escalation = true;
    reason = `base ${base} + content escalation 1 (${flags.map((f) => f.pattern).join(", ")})`;
  }
  let override: string | null = null;
  if (best === "specific_with_verification_detail" && patternWeight === 0) {
    remaining = 0;
    override = "de-escalation: verification detail with no patterns";
  } else if (candid.length > 0 && patternWeight === 0) {
    remaining = Math.max(0, remaining - 1);
    override = "de-escalation: candid signal";
  }
  if (session.probe_pool_remaining <= 0) {
    remaining = 0;
    override = "interview probe pool exhausted";
  }
  const row = {
    answer_id: answerId,
    pattern_weight: patternWeight,
    distinct_moderate: distinctModerate,
    evidence_grade: best,
    content_escalation: escalation,
    attention_boost: false,
    base,
    cap,
    pool_before: session.probe_pool_remaining,
    pool_after: session.probe_pool_remaining,
    model_recommendation: String(evaluation.recommended_next_action ?? "advance"),
    backend_decision:
      remaining > 0 && String(evaluation.recommended_next_action) === "probe" ? "probe" : "advance",
    override_reason: override,
  };
  session.probe_budget_remaining = remaining;
  session.probe_budget_reason = reason;
  return row;
}
