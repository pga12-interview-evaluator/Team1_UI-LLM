import "server-only";
import type { FinalReport, TranscriptEntry } from "@/lib/api/schemas/console";
import {
  practiceReviewSchema,
  type PracticeReview,
  type ReviewAnswer,
} from "@/lib/api/schemas/review";
import { loadBehavioral } from "../behavioralStore";
import type { RealSession } from "../store";
import { speechMetrics, speechNotes } from "./speech";

type Dict = Record<string, unknown>;

/** Evaluator pattern ids → what the candidate should do differently (plain language, no jargon). */
const PATTERN_LABELS: Record<string, string> = {
  B01_keyword_stack: "Listed tools or terms without saying what you did with them",
  B02_textbook_generic: "Textbook explanation instead of your own example",
  B03_context_free: "No context: where, when, what system, what scale",
  B04_collective_ownership: 'Said "we" — unclear which part was yours',
  B05_scope_inflation: "Claimed a broader scope than the details support",
  B06_reasoning_deflection: 'Deflected the "why" behind a decision',
  B07_non_commitment: "Did not commit to a position or a number",
  B08_echo_padding: "Repeated the question back instead of answering",
  B09_frictionless_narrative: "Story with no obstacle, trade-off or failure",
  B10_structure_without_instance: "Described a process but no concrete instance of it",
  B11_adjacent_substitution: "Answered a nearby question, not the one asked",
  B12_unsupported_metric: "Gave a number without its baseline, window or source",
  B13_vague_outcome: 'Outcome was vague ("it improved") — say by how much and how you know',
  B14_timeline_scale_inconsistency: "Timeline or scale did not add up",
  B15_confidence_content_mismatch: "Confident tone, thin content",
  B16_observer_account: "Described what happened around you rather than what you did",
  B17_tool_laundering: "Tool name stood in for the method",
  B18_cross_turn_drift: "Details changed between answers",
  B19_jd_parroting: "Echoed the job description wording",
  B20_rung_retreat: "Retreated to a simpler version when pushed",
  B21_constraint_insensitivity: "Ignored the constraint the question set",
  B22_specificity_inversion: "Detailed on the easy part, vague on the hard part",
  B23_accepted_flawed_premise: "Accepted a flawed premise in the question",
  B24_unreasoned_choice: "Named a choice without the reasoning behind it",
};

const CANDID_LABELS: Record<string, string> = {
  honest_down_scope: "Honestly narrowed the claim to what you actually did",
  named_confounder: "Named a confounder in your own result",
  admitted_overruled: "Admitted being overruled",
  specific_regret: "Named a specific thing you would do differently",
  idk_with_process: 'Said "I don\'t know" and explained how you would find out',
  read_not_done_admitted: "Distinguished what you read from what you did",
  self_correction: "Corrected yourself",
  confidentiality_with_shape: "Kept confidentiality but still gave the shape of the work",
  asked_high_value_clarification: "Asked a clarifying question that mattered",
  explicit_assumption: "Stated your assumption explicitly",
  named_own_downside: "Named the downside of your own choice",
  specific_failure_owned: "Owned a specific failure",
};

const RECOMMENDATION_HEADLINE: Record<string, string> = {
  strong_positive_signal: "Strong: specific, first-person, verifiable answers",
  positive_signal_with_follow_up: "Good, with a few claims still to back up",
  mixed_signal: "Mixed: some answers landed, others stayed generic",
  insufficient_evidence:
    "Not enough evidence yet — the interview ended before the plan was covered",
  concern_signal: "Needs work: answers did not hold up under follow-up",
};

const TURN_KIND: Record<string, string> = {
  main_question: "main question",
  follow_up: "follow-up",
  callback: "callback",
  constraint_mutation: "constraint change",
  ladder_step: "harder version",
  reframe: "rephrased question",
  reconciliation: "reconciliation",
  clarification_reveal: "clarification",
};

const CLAIM_STATUS: Record<string, string> = {
  supported: "Supported — you backed it up",
  partially_supported: "Partly supported",
  unresolved_after_probing: "Unresolved — the follow-up did not settle it",
  not_tested: "Not tested — the interview ended first",
  conflicting_with_quotes: "Conflicts with something else you said",
  revised_by_candidate: "You revised it yourself",
  withheld_confidential: "Withheld as confidential",
  not_their_scope: "Outside your scope",
};

const label = (map: Record<string, string>, key: string) =>
  map[key] ?? key.replace(/^B\d+_/, "").replace(/_/g, " ");

function competencyNames(session: RealSession): Record<string, string> {
  const names: Record<string, string> = {};
  for (const c of (session.blueprint?.competencies as Dict[] | undefined) ?? [])
    names[String(c.id)] = String(c.name ?? c.id);
  return names;
}

/** Interviewer entry the candidate answered: the last interviewer turn before the answer. */
function questionFor(transcript: TranscriptEntry[], answerIndex: number): TranscriptEntry | null {
  for (let i = answerIndex - 1; i >= 0; i -= 1)
    if (transcript[i]?.role === "interviewer") return transcript[i] ?? null;
  return null;
}

/** Interviewer turn right after the answer, when it was composed because of it (a probe). */
function followUpFor(transcript: TranscriptEntry[], answerIndex: number): string | null {
  const next = transcript[answerIndex + 1];
  if (!next || next.role !== "interviewer") return null;
  return next.turn_type && next.turn_type !== "main_question" && next.turn_type !== "closing"
    ? next.text
    : null;
}

function mediaFor(session: RealSession, answer: TranscriptEntry) {
  return Object.values(session.media_refs).find((m) => m.turn_index === answer.turn_index - 1);
}

/** Per-answer speech block: Team 4's analysis when the answer was spoken, transcript metrics otherwise. */
function speechFor(
  text: string,
  media: ReturnType<typeof mediaFor>,
): NonNullable<ReviewAnswer["speech"]> {
  const base = speechMetrics(text, media?.duration_sec ?? null);
  const t4 = media?.speech ?? null;
  const segments = media?.segments ?? [];
  if (!t4)
    return {
      ...base,
      filler_words: {},
      repetitions: [],
      long_pauses: 0,
      longest_pause_sec: 0,
      fluency_score: null,
      segments,
    };
  return {
    words: t4.total_words || base.words,
    duration_sec: t4.duration,
    words_per_minute: t4.wpm ? Math.round(t4.wpm) : base.words_per_minute,
    filler_count: t4.filler_count,
    fillers_per_100_words: t4.total_words
      ? Number(((t4.filler_count / t4.total_words) * 100).toFixed(1))
      : 0,
    top_fillers: Object.entries(t4.filler_words)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w, n]) => `${w} ×${n}`),
    filler_words: t4.filler_words,
    repetitions: t4.repetitions,
    long_pauses: t4.long_pauses,
    longest_pause_sec: t4.longest_pause,
    fluency_score: t4.fluency_score,
    segments,
  };
}

/**
 * Words-per-minute over the interview's speaking time, kernel-smoothed (a KDE-style curve of
 * pace). Answers are laid end to end; each speaking block contributes its own rate.
 */
function paceCurve(
  answers: { speech: NonNullable<ReviewAnswer["speech"]>; label: string }[],
  samples = 72,
): NonNullable<NonNullable<PracticeReview["speech_summary"]>["pace_curve"]> | null {
  const blocks: { start: number; end: number; wpm: number }[] = [];
  const marks: { at: number; label: string }[] = [];
  let offset = 0;
  for (const { speech, label } of answers) {
    const segs = speech.segments.filter((s) => s.end > s.start);
    if (!segs.length) continue;
    marks.push({ at: offset, label });
    const answerEnd = Math.max(...segs.map((s) => s.end));
    for (const s of segs) {
      const seconds = s.end - s.start;
      blocks.push({ start: offset + s.start, end: offset + s.end, wpm: (s.words / seconds) * 60 });
    }
    offset += answerEnd + 1.5; // a short gap between answers on the shared timeline
  }
  if (!blocks.length) return null;
  const total = offset;
  const bandwidth = Math.max(2, total * 0.04);
  const points: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = (i / (samples - 1)) * total;
    let weight = 0;
    let sum = 0;
    for (const b of blocks) {
      const mid = (b.start + b.end) / 2;
      const w = Math.exp(-0.5 * ((t - mid) / bandwidth) ** 2) * (b.end - b.start);
      weight += w;
      sum += w * b.wpm;
    }
    points.push(weight > 0 ? Math.round(sum / weight) : 0);
  }
  const spoken = blocks.reduce((s, b) => s + (b.end - b.start), 0);
  const words = blocks.reduce((s, b) => s + (b.wpm * (b.end - b.start)) / 60, 0);
  return {
    points,
    average: spoken ? Math.round((words / spoken) * 60) : 0,
    peak: Math.max(...points),
    total_seconds: Number(total.toFixed(1)),
    answer_marks: marks.map((m) => ({ at: Number((m.at / total).toFixed(4)), label: m.label })),
  };
}

function presenceFor(session: RealSession, answerId: string) {
  const record = loadBehavioral(session.session_id);
  const entry = record.answers[answerId];
  if (!entry) return null;
  const r = entry.team3.report as Record<string, number>;
  return {
    camera_facing_percent: Number(r.camera_facing_gaze_percent ?? 0),
    upright_posture_percent: Number(r.upright_posture_percent ?? 0),
    camera_presence_percent: Number(r.camera_presence_percent ?? 0),
    gaze_away_events: Number(r.gaze_away_events ?? 0),
    high_movement_periods: Number(r.high_movement_periods ?? 0),
  };
}

function presenceCoaching(p: NonNullable<PracticeReview["presence_summary"]>): string[] {
  const tips: string[] = [];
  if (p.camera_presence_percent < 70)
    tips.push(
      "Face and shoulders were out of frame for part of the interview — sit centred, about an arm's length from the camera.",
    );
  if (p.camera_facing_percent < 40)
    tips.push(
      "You faced away from the camera most of the time — glance at the lens when you make a key point.",
    );
  else if (p.camera_facing_percent < 70)
    tips.push(
      "Camera-facing under 70% — fine when thinking, but return to the lens when answering.",
    );
  if (p.upright_posture_percent < 60)
    tips.push(
      "Posture read as leaning or off-centre for much of the session — sit back, shoulders level.",
    );
  if (p.high_movement_periods >= 3)
    tips.push(
      `${p.high_movement_periods} periods of high movement — keep hands and torso settled while speaking.`,
    );
  if (!tips.length) tips.push("Steady presence: centred, facing the camera, calm posture.");
  return tips;
}

function reportSection(session: RealSession, report: FinalReport | null): PracticeReview["report"] {
  if (!report) return null;
  const names = competencyNames(session);
  const ceilings = new Map(report.knowledge_ceiling_summary.map((k) => [k.competency_id, k]));
  const feedback = report.candidate_feedback;
  return {
    overall_score: report.overall_weighted_score,
    recommendation: report.recommendation,
    headline: RECOMMENDATION_HEADLINE[report.recommendation] ?? report.recommendation,
    rationale: report.recommendation_rationale,
    competencies: report.competency_assessment.map((c) => {
      const ceiling = ceilings.get(c.competency_id);
      return {
        competency_id: c.competency_id,
        name: c.competency_name || names[c.competency_id] || c.competency_id,
        weight: c.weight,
        score: c.knowledge_depth_score,
        confidence: c.confidence,
        demonstrated_up_to: ceiling?.demonstrated_up_to ?? "not_assessed",
        bar: ceiling?.seniority_bar_rung ?? "not_assessed",
        gap: c.evidence_gap,
        evidence: c.evidence_for,
      };
    }),
    strengths: feedback?.strengths_in_plain_language.length
      ? feedback.strengths_in_plain_language
      : report.demonstrated_strengths,
    gaps: report.material_gaps_or_risks,
    practice_suggestions: feedback?.practice_suggestions ?? [],
    unverified_claims: report.unverified_claims,
    claims: report.claim_ledger_resolution.map((c) => ({
      claim_id: c.claim_id,
      text: c.claim_text,
      materiality: c.materiality,
      status: c.final_status,
      status_label: CLAIM_STATUS[c.final_status] ?? c.final_status.replace(/_/g, " "),
      why: c.why_unsupported,
      quotes: c.quotes,
    })),
    metrics: report.metric_table.map((m) => ({
      claim_id: m.claim_id,
      headline: m.headline,
      status: m.metric_status,
      parts: m.parts,
    })),
    patterns: report.pattern_summary.map((p) => ({
      label: label(PATTERN_LABELS, p.pattern),
      occurrences: p.occurrences,
      example: p.example_quotes[0] ?? "",
    })),
    candid: report.candid_signals_summary.map((s) => ({
      label: label(CANDID_LABELS, s.signal),
      occurrences: s.occurrences,
      example: s.example_quote,
    })),
    ownership: {
      expected: report.ownership_profile.expected_for_seniority,
      demonstrated: report.ownership_profile.demonstrated_summary,
      down_scopes: report.ownership_profile.honest_down_scopes,
    },
    consistency: report.consistency_notes.map((n) => ({
      status: n.status.replace(/_/g, " "),
      quote_a: n.quote_a,
      quote_b: n.quote_b,
      resolution: n.resolution_status.replace(/_/g, " "),
      question: n.neutral_resolution_question,
    })),
    pressure: {
      narrative: report.pressure_response_summary.narrative,
      by_question: report.pressure_response_summary.specificity_trend_by_question.map((q) => ({
        question_id: q.question_id,
        direction: q.direction,
      })),
    },
  };
}

/**
 * Assemble the candidate's own practice review. `report` is the validated 04 projection (or
 * null when generation failed — the per-answer section still comes from the 03 evaluations).
 */
export function buildPracticeReview(
  session: RealSession,
  report: FinalReport | null,
  reportError: string | null,
): PracticeReview {
  const names = competencyNames(session);
  const transcript = session.transcript;
  const speechByAnswer: NonNullable<ReviewAnswer["speech"]>[] = [];
  const answers: ReviewAnswer[] = [];
  const presenceEnabled =
    session.consent.behavioral_analysis_consent &&
    session.device.camera &&
    session.accommodations.length === 0;

  // Evaluations are consumed in order per answer_id: a rephrase request and the real answer that
  // follows share an id, and each has its own 03 evaluation.
  const queues = new Map<string, typeof session.evaluations>();
  for (const evaluation of session.evaluations)
    queues.set(evaluation.answer_id, [...(queues.get(evaluation.answer_id) ?? []), evaluation]);

  transcript.forEach((entry, index) => {
    if (entry.role !== "candidate" || !entry.answer_id || !entry.question_id) return;
    const question = questionFor(transcript, index);
    const evaluation = queues.get(entry.answer_id)?.shift();
    // A candidate turn with no evaluation (repeat/rephrase request, empty answer) is not an answer.
    if (!evaluation || entry.text === "[no answer]") return;
    const speech = speechFor(entry.text, mediaFor(session, entry));
    speechByAnswer.push(speech);
    answers.push({
      answer_id: entry.answer_id,
      question_id: entry.question_id,
      question: question?.text ?? "",
      kind: TURN_KIND[question?.turn_type ?? ""] ?? "question",
      answer: entry.text,
      scores: evaluation.competency_scores.map((c) => ({
        competency_id: c.competency_id,
        name: names[c.competency_id] ?? c.competency_id,
        score: c.score,
        evidence_grade: c.evidence_grade.replace(/_/g, " "),
        evidence: c.evidence,
        missing: c.missing_evidence,
      })),
      watch_outs: evaluation.pattern_flags.map((f) => ({
        label: label(PATTERN_LABELS, f.pattern),
        quote: f.quote,
        severity: f.severity,
      })),
      good_moves: evaluation.candid_signals.map((s) => ({
        label: label(CANDID_LABELS, s.signal),
        quote: s.quote,
      })),
      follow_up_asked: followUpFor(transcript, index),
      speech,
      presence: presenceEnabled ? presenceFor(session, entry.answer_id) : null,
    });
  });

  const withPresence = answers
    .map((a) => a.presence)
    .filter((p): p is NonNullable<typeof p> => !!p);
  const avg = (pick: (p: (typeof withPresence)[number]) => number) =>
    withPresence.length
      ? Number((withPresence.reduce((s, p) => s + pick(p), 0) / withPresence.length).toFixed(1))
      : 0;
  const presenceBase = withPresence.length
    ? {
        note: "Coaching signals from your camera. They are not part of your score and were used only to choose follow-up questions.",
        camera_facing_percent: avg((p) => p.camera_facing_percent),
        upright_posture_percent: avg((p) => p.upright_posture_percent),
        camera_presence_percent: avg((p) => p.camera_presence_percent),
        gaze_away_events: withPresence.reduce((s, p) => s + p.gaze_away_events, 0),
        high_movement_periods: withPresence.reduce((s, p) => s + p.high_movement_periods, 0),
        coaching: [] as string[],
      }
    : null;
  const totalWords = speechByAnswer.reduce((s, m) => s + m.words, 0);
  const paced = speechByAnswer.filter((m) => m.words_per_minute !== null);
  const started = session.started_at ? Date.parse(session.started_at) : null;
  const ended = session.ended_at ? Date.parse(session.ended_at) : null;

  const review: PracticeReview = {
    session_id: session.session_id,
    job_title: String(session.interview_input.job_title ?? ""),
    seniority: String(session.interview_input.seniority ?? ""),
    started_at: session.started_at,
    ended_at: session.ended_at,
    duration_minutes: started && ended ? Number(((ended - started) / 60_000).toFixed(1)) : 0,
    questions_answered: new Set(answers.map((a) => a.question_id)).size,
    report: reportSection(session, report),
    report_error: reportError,
    answers,
    speech_summary: answers.length
      ? {
          total_words: totalWords,
          average_words_per_minute: paced.length
            ? Math.round(paced.reduce((s, m) => s + (m.words_per_minute ?? 0), 0) / paced.length)
            : null,
          fillers_per_100_words: totalWords
            ? Number(
                (
                  (speechByAnswer.reduce((s, m) => s + m.filler_count, 0) / totalWords) *
                  100
                ).toFixed(1),
              )
            : 0,
          notes: speechNotes(speechByAnswer),
          filler_words: speechByAnswer.reduce<Record<string, number>>((acc, m) => {
            for (const [w, n] of Object.entries(m.filler_words)) acc[w] = (acc[w] ?? 0) + n;
            return acc;
          }, {}),
          repetition_count: speechByAnswer.reduce((s, m) => s + m.repetitions.length, 0),
          long_pauses: speechByAnswer.reduce((s, m) => s + m.long_pauses, 0),
          longest_pause_sec: Math.max(0, ...speechByAnswer.map((m) => m.longest_pause_sec)),
          fluency_score: (() => {
            const scored = speechByAnswer.filter((m) => m.fluency_score !== null);
            return scored.length
              ? Number(
                  (scored.reduce((s, m) => s + (m.fluency_score ?? 0), 0) / scored.length).toFixed(
                    1,
                  ),
                )
              : null;
          })(),
          source: speechByAnswer.some((m) => m.fluency_score !== null)
            ? "Team 4 speech analysis (fillers, repetitions, pauses, fluency)"
            : null,
          pace_curve: paceCurve(
            answers.flatMap((a, i) => (a.speech ? [{ speech: a.speech, label: `${i + 1}` }] : [])),
          ),
        }
      : null,
    presence_summary: presenceBase
      ? { ...presenceBase, coaching: presenceCoaching(presenceBase) }
      : null,
    presence_status: !session.consent.behavioral_analysis_consent
      ? "no_consent"
      : !session.device.camera ||
          session.accommodations.includes("camera_off") ||
          session.accommodations.includes("text_modality")
        ? "camera_off"
        : withPresence.length
          ? "available"
          : "no_data",
  };
  return practiceReviewSchema.parse(review);
}
