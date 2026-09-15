import type { FinalReport, Requisition } from "@/lib/api/schemas/console";
import { COMPETENCIES, PLAN } from "../fixtures/plan";
import type { MockSession } from "../store";

const DISCLAIMER =
  "Non-scored context. These behavioral signals were not used in any competency score, finding, or recommendation above and must not be used by a reviewer to adjust them. Automated behavior analysis does not detect deception. Shown for follow-up-question audit only.";

/** Deterministic mock of Prompt 04: aggregates the recorded evaluations into a report. */
export function buildReport(session: MockSession, requisition: Requisition): FinalReport {
  const byCompetency = new Map<string, number[]>();
  for (const evaluation of session.evaluations) {
    for (const score of evaluation.competency_scores) {
      const list = byCompetency.get(score.competency_id) ?? [];
      list.push(score.score);
      byCompetency.set(score.competency_id, list);
    }
  }

  const competencyAssessment = COMPETENCIES.map((competency) => {
    const scores = byCompetency.get(competency.id) ?? [];
    const last = scores.length ? scores[scores.length - 1] : null;
    const evidence = session.evaluations
      .filter((evaluation) =>
        evaluation.competency_scores.some((s) => s.competency_id === competency.id),
      )
      .slice(-2)
      .map((evaluation) => ({
        question_id: evaluation.question_id,
        quote: evaluation.competency_scores[0]?.evidence[0] ?? "",
        observation: evaluation.question_digest,
      }));
    return {
      competency_id: competency.id,
      competency_name: competency.name,
      weight: competency.weight,
      knowledge_depth_score: last,
      confidence: (scores.length >= 2 ? "medium" : scores.length ? "low" : "low") as
        "low" | "medium" | "high",
      evidence_for: evidence,
      evidence_gap:
        last === null
          ? "Not tested in this interview."
          : last < 3
            ? "No situated instance with an anchor was obtained."
            : null,
    };
  });

  const assessedWeight = competencyAssessment
    .filter((c) => c.knowledge_depth_score !== null)
    .reduce((sum, c) => sum + c.weight, 0);
  const weighted = competencyAssessment.filter((c) => c.knowledge_depth_score !== null);
  const overall =
    weighted.length && assessedWeight >= 60
      ? Number(
          (
            weighted.reduce((sum, c) => sum + (c.knowledge_depth_score ?? 0) * c.weight, 0) /
            assessedWeight
          ).toFixed(2),
        )
      : null;

  const patterns = new Map<string, { count: number; quotes: string[] }>();
  const candid = new Map<string, { count: number; quote: string }>();
  for (const evaluation of session.evaluations) {
    for (const flag of evaluation.pattern_flags) {
      const entry = patterns.get(flag.pattern) ?? { count: 0, quotes: [] };
      entry.count += 1;
      if (entry.quotes.length < 2) entry.quotes.push(flag.quote);
      patterns.set(flag.pattern, entry);
    }
    for (const signal of evaluation.candid_signals) {
      const entry = candid.get(signal.signal) ?? { count: 0, quote: signal.quote };
      entry.count += 1;
      candid.set(signal.signal, entry);
    }
  }

  const critical = competencyAssessment.filter(
    (c) => COMPETENCIES.find((k) => k.id === c.competency_id)?.is_must_have || c.weight >= 15,
  );
  const strong = critical.filter((c) => (c.knowledge_depth_score ?? 0) >= 3);
  const lowCoverage = assessedWeight < 60;
  let recommendation: FinalReport["recommendation"] = "mixed_signal";
  if (lowCoverage || session.status === "escalated") recommendation = "insufficient_evidence";
  else if (strong.length === critical.length && overall !== null && overall >= 3.5)
    recommendation = "strong_positive_signal";
  else if (strong.length * 3 >= critical.length * 2)
    recommendation = "positive_signal_with_follow_up";
  else if (critical.filter((c) => (c.knowledge_depth_score ?? 5) < 2).length >= 2)
    recommendation = "concern_signal";

  const questionsAsked = new Set(session.evaluations.map((e) => e.question_id)).size;

  return {
    report_version: "2.0",
    session_id: session.session_id,
    role: {
      job_title: requisition.job_title,
      field: requisition.field,
      field_family: requisition.field_family ?? "general_business",
      seniority: requisition.seniority,
    },
    interview_config: {
      pressure_level: requisition.pressure_level,
      pressure_rationale: requisition.pressure_rationale,
      interview_purpose: requisition.interview_purpose,
      duration_minutes: requisition.duration_minutes,
      interview_language: session.interview_language,
    },
    evidence_coverage: {
      assessed_competency_weight_percent: assessedWeight,
      critical_competencies_with_sufficient_evidence: strong.map((c) => c.competency_id),
      critical_competencies_needing_more_evidence: critical
        .filter((c) => !strong.includes(c))
        .map((c) => c.competency_id),
      coverage_confidence: lowCoverage
        ? "low"
        : questionsAsked >= PLAN.length - 1
          ? "medium"
          : "low",
    },
    competency_assessment: competencyAssessment,
    overall_weighted_score: overall,
    knowledge_ceiling_summary: COMPETENCIES.filter((c) => c.is_must_have || c.weight >= 15).map(
      (c) => ({
        competency_id: c.id,
        demonstrated_up_to: (byCompetency.get(c.id)?.some((s) => s >= 3)
          ? "L2"
          : byCompetency.get(c.id)?.length
            ? "L1"
            : "none") as "none" | "L1" | "L2" | "L3",
        seniority_bar_rung: c.seniority_bar_rung,
        ceiling_gap: byCompetency.get(c.id)?.length
          ? byCompetency.get(c.id)?.some((s) => s >= 3)
            ? "none"
            : "one_tier"
          : "not_assessed",
      }),
    ),
    claim_ledger_resolution: [
      {
        claim_id: "R1",
        claim_text: "Led monthly variance analysis and reduced close reporting time by 30%",
        materiality: "high",
        final_status: (byCompetency.get("C1")?.some((s) => s >= 4)
          ? "supported"
          : byCompetency.get("C1")?.some((s) => s >= 3)
            ? "partially_supported"
            : byCompetency.get("C1")?.length
              ? "unresolved_after_probing"
              : "not_tested") as FinalReport["claim_ledger_resolution"][number]["final_status"],
        why_unsupported: byCompetency.get("C1")?.some((s) => s >= 3) ? null : "budget",
        quotes: session.transcript
          .filter((t) => t.question_id === "Q2" && t.role === "candidate")
          .slice(0, 2)
          .map((t) => t.text.slice(0, 160)),
        what_probes_yielded:
          session.evaluations.find((e) => e.question_id === "Q2")?.question_digest ?? "Not probed.",
      },
    ],
    metric_table: [
      {
        claim_id: "R1",
        headline: "30% faster close reporting",
        parts: {
          baseline: byCompetency.get("C1")?.some((s) => s >= 4) ? "stated" : "missing",
          window: "not_probed",
          definition: "not_probed",
          source: byCompetency.get("C1")?.some((s) => s >= 4) ? "stated" : "missing",
          confounders: "not_probed",
          causality: "not_probed",
          persistence: "not_probed",
        },
        metric_status: byCompetency.get("C1")?.some((s) => s >= 4) ? "anchored" : "unanchored",
      },
    ],
    ownership_profile: {
      expected_for_seniority: "owner of a bounded workstream",
      demonstrated_summary: candid.has("honest_down_scope")
        ? "Owner of a bounded piece; adjacent owners named by role after an OWN probe."
        : "Ownership asserted collectively; boundary not demonstrated.",
      honest_down_scopes: candid.has("honest_down_scope")
        ? [{ claim_id: "R1", quote: candid.get("honest_down_scope")!.quote }]
        : [],
      notes: candid.size
        ? []
        : ["No claims of high or medium materiality were narrowed by the candidate."],
    },
    pattern_summary: Array.from(patterns.entries()).map(([pattern, entry]) => ({
      pattern,
      occurrences: entry.count,
      example_quotes: entry.quotes,
      what_probes_yielded:
        session.evaluations.find((e) => e.pattern_flags.some((f) => f.pattern === pattern))
          ?.question_digest ?? "",
    })),
    candid_signals_summary: Array.from(candid.entries()).map(([signal, entry]) => ({
      signal,
      occurrences: entry.count,
      example_quote: entry.quote,
    })),
    consistency_notes: [],
    pressure_response_summary: {
      narrative: session.probes_total
        ? "Specificity movement across probes is recorded per question below."
        : "No follow-up probes were asked; specificity movement not observable.",
      specificity_trend_by_question: PLAN.filter((item) => item.question_type !== "warm_up").map(
        (item) => {
          const scores = session.evaluations
            .filter((e) => e.question_id === item.question_id)
            .map((e) => e.competency_scores[0]?.score ?? 0);
          const direction =
            scores.length < 2
              ? "not_applicable"
              : scores[scores.length - 1] > scores[0]
                ? "increasing"
                : scores[scores.length - 1] < scores[0]
                  ? "decreasing"
                  : "flat";
          return { question_id: item.question_id, direction };
        },
      ),
    },
    demonstrated_strengths: competencyAssessment
      .filter((c) => (c.knowledge_depth_score ?? 0) >= 3)
      .map(
        (c) =>
          `${c.competency_name}: situated instance with an anchor (${c.evidence_for[0]?.question_id ?? "–"}).`,
      ),
    material_gaps_or_risks: competencyAssessment
      .filter((c) => c.knowledge_depth_score !== null && c.knowledge_depth_score < 2)
      .map((c) => `${c.competency_name}: no situated evidence obtained.`),
    unverified_claims: byCompetency.get("C1")?.some((s) => s >= 3)
      ? []
      : ["R1: close-time reduction (baseline and source not established)."],
    recommendation,
    recommendation_rationale: `Rule fired: ${recommendation}. Assessed weight ${assessedWeight}%; critical competencies strong: ${strong.length}/${critical.length}.`,
    recommended_next_step: {
      type:
        recommendation === "strong_positive_signal"
          ? "human_review"
          : "focused_follow_up_interview",
      purpose:
        recommendation === "strong_positive_signal"
          ? "Confirm the interview signal against role-specific criteria."
          : "Establish the metric provenance and ownership boundary on the close-time claim.",
      targeted_questions_or_criteria: [
        "Baseline close days and the tracker they came from",
        "Who owned the close calendar, by role",
      ],
    },
    human_reviewer_notes: [
      "This label is an interview signal, not a decision. Record your decision and reason in the console.",
      `reviewer_flags: ${session.evaluations.some((e) => e.reviewer_flags.length) ? "[present]" : "none"}`,
    ],
    coverage_limitations: lowCoverage ? ["Fewer than 60% of competency weight was assessed."] : [],
    candidate_feedback:
      requisition.interview_purpose === "mock_practice"
        ? {
            note: "Practice feedback only; not a hiring assessment.",
            strengths_in_plain_language: competencyAssessment
              .filter((c) => (c.knowledge_depth_score ?? 0) >= 3)
              .map(
                (c) =>
                  `You gave a specific, first-person example for ${c.competency_name.toLowerCase()}.`,
              ),
            practice_suggestions: [
              "Bring the before-number and its source for any result you mention.",
              "Say which part was yours and who owned the rest, by role.",
            ],
          }
        : null,
    non_scored_behavioral_context: session.consent.behavioral_analysis_consent
      ? {
          disclaimer: DISCLAIMER,
          capture_status:
            session.accommodations.includes("no_behavioral_analysis") ||
            session.accommodations.includes("camera_off")
              ? "disabled_by_accommodation"
              : "partial",
          coverage: {
            answers_with_signals: Math.max(0, session.evaluations.length - 1),
            answers_partial: 1,
            answers_without: 0,
          },
          flags_by_answer: [],
          used_in_scoring: false,
          shown_by_default: false,
        }
      : {
          disclaimer: DISCLAIMER,
          capture_status: "disabled_by_consent",
          coverage: {
            answers_with_signals: 0,
            answers_partial: 0,
            answers_without: session.evaluations.length,
          },
          flags_by_answer: [],
          used_in_scoring: false,
          shown_by_default: false,
        },
  };
}
