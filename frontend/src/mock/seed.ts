import type { Requisition } from "@/lib/api/schemas/console";
import { COMPETENCIES, PLAN } from "./fixtures/plan";
import { db, type MockSession } from "./store";

const JD = `FP&A Analyst — Manufacturing finance.
Own month-end close reporting for three plants: consolidate plant controller inputs, run the accrual schedule, publish the day-five pack.
Lead monthly variance analysis (price, volume, mix, cost) and present a variance bridge to the plant managers.
Build and maintain Excel models for forecasts and what-if scenarios; partner with plant controllers on data quality.
Must have: variance analysis, month-end close, Excel modelling. Nice to have: Power BI.`;

export function blueprintFor(
  requisition: Pick<Requisition, "duration_minutes">,
): NonNullable<Requisition["blueprint"]> {
  const planned = PLAN.reduce((sum, item) => sum + item.time_budget_minutes, 0);
  return {
    blueprint_version: "2.1",
    competencies: COMPETENCIES.map((c) => ({ ...c, has_ladder: c.is_must_have || c.weight >= 15 })),
    interview_plan: PLAN.map((item) => ({
      order: item.order,
      question_id: item.question_id,
      question_type: item.question_type,
      candidate_facing_question: item.scenario
        ? `${item.scenario.setup} ${item.question}`
        : item.question,
      time_budget_minutes: item.time_budget_minutes,
      target_competencies: [...item.target_competencies],
      probe_count: item.probes.length,
    })),
    interview_control: {
      planned_minutes: planned,
      candidate_questions_reserve_minutes: Math.max(
        4,
        Math.round(requisition.duration_minutes * 0.1),
      ),
      minimum_main_questions: 3,
      maximum_main_questions: PLAN.length,
    },
    self_check: {
      weights_total_100: COMPETENCIES.reduce((s, c) => s + c.weight, 0) === 100,
      critical_competencies_have_ladders: true,
      every_metric_claim_has_scaffold: true,
      no_signal_terms_in_candidate_facing_text: true,
      no_protected_trait_content: true,
      protected_trait_content_detected: [],
      software_terms_detected: [],
      fits_time_budget:
        planned + Math.max(4, Math.round(requisition.duration_minutes * 0.1)) <=
        requisition.duration_minutes,
      premise_is_common_misconception: null,
      scenario_fact_table_consistent: true,
    },
    validation: { passed: true, failures: [] },
  };
}

export function newSession(
  requisition: Requisition,
  candidateLabel: string,
  language: string,
): MockSession {
  const id = `S_${Math.random().toString(36).slice(2, 10)}`;
  const token = `inv_${Math.random().toString(36).slice(2, 14)}`;
  const session: MockSession = {
    session_id: id,
    invite_token: token,
    requisition_id: requisition.requisition_id,
    candidate_label: candidateLabel,
    interview_language: language,
    status: "awaiting_consent",
    consent: {
      ai_interview_notice_ack: false,
      recording_consent: false,
      behavioral_analysis_consent: false,
      notice_version: "2026-03",
    },
    device: { camera: false, microphone: false },
    accommodations: requisition.interview_modality === "text" ? ["text_modality"] : [],
    created_at: new Date().toISOString(),
    started_at: null,
    ended_at: null,
    escalation_reason: null,
    plan_index: 0,
    anchors_asked: false,
    probes_used: 0,
    probe_budget: 2,
    probes_total: 0,
    revealed_facts: [],
    pending_question_text: null,
    turn_index: 0,
    current_turn: null,
    transcript: [],
    evaluations: [],
    budget_audit: [],
    candidate_questions_asked: 0,
    report: null,
    human_decision: null,
    evaluating_until: null,
    next_after_evaluation: null,
  };
  db().sessions.set(id, session);
  db().tokens.set(token, id);
  requisition.session_count += 1;
  return session;
}

export function seed(): void {
  const store = db();
  if (store.seeded) return;
  store.seeded = true;
  const now = new Date().toISOString();
  const requisition: Requisition = {
    requisition_id: "REQ_demo_fpa",
    status: "frozen",
    created_at: now,
    updated_at: now,
    job_title: "FP&A Analyst",
    field: "Manufacturing finance",
    field_family: "finance_accounting",
    seniority: "mid",
    employment_type: "full_time",
    location_or_market: "Pune",
    interview_language: "en-IN",
    duration_minutes: 45,
    interview_style: "mixed",
    interview_modality: "both",
    interview_purpose: "hiring",
    pressure_level: "standard",
    pressure_rationale: null,
    job_description: JD,
    must_have_skills: ["variance analysis", "month-end close", "Excel modelling"],
    nice_to_have_skills: ["Power BI"],
    company_context:
      "Mid-size auto-components manufacturer with three plants in Maharashtra. The role reports to the FP&A manager and works with three plant controllers.",
    interviewer_constraints: "No spreadsheet task.",
    blueprint: null,
    session_count: 0,
  };
  requisition.blueprint = blueprintFor(requisition);
  store.requisitions.set(requisition.requisition_id, requisition);

  const practice: Requisition = {
    ...requisition,
    requisition_id: "REQ_demo_practice",
    job_title: "Digital Marketing Manager (practice)",
    field: "B2C e-commerce marketing",
    field_family: "sales_marketing",
    interview_purpose: "mock_practice",
    pressure_level: "calm",
    must_have_skills: ["campaign planning", "performance marketing", "attribution"],
    nice_to_have_skills: [],
    status: "blueprint_review",
    session_count: 0,
  };
  practice.blueprint = blueprintFor(practice);
  store.requisitions.set(practice.requisition_id, practice);

  // A fixed demo invite so the candidate flow is reachable at a stable URL.
  const demo = newSession(requisition, "Candidate 01", "en-IN");
  store.tokens.delete(demo.invite_token);
  demo.invite_token = "demo";
  store.tokens.set("demo", demo.session_id);
}
