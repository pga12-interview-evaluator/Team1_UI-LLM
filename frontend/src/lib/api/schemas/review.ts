import { z } from "zod";

/**
 * Practice review — what the candidate sees about their OWN mock interview after it ends.
 * Only for `interview_purpose: mock_practice`; hiring interviews never expose scores to the
 * candidate. Content scores come from Prompts 03/04; speech and presence sections are coaching
 * signals computed outside the model and are explicitly not part of any score.
 */

export const reviewCompetencySchema = z.object({
  competency_id: z.string(),
  name: z.string(),
  weight: z.number().int(),
  /** 0–5 from the final report; null when the interview ended before it could be assessed. */
  score: z.number().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  demonstrated_up_to: z.enum(["none", "L1", "L2", "L3", "not_assessed"]),
  bar: z.enum(["L1", "L2", "L3", "not_assessed"]),
  gap: z.string().nullable(),
  /** What the report counted, quoted from your answers. */
  evidence: z.array(
    z.object({ question_id: z.string(), quote: z.string(), observation: z.string() }),
  ),
});

export const reviewClaimSchema = z.object({
  claim_id: z.string(),
  text: z.string(),
  materiality: z.enum(["high", "medium", "low"]),
  status: z.string(),
  status_label: z.string(),
  why: z.string().nullable(),
  quotes: z.array(z.string()),
});

export const reviewMetricSchema = z.object({
  claim_id: z.string(),
  headline: z.string(),
  status: z.enum(["anchored", "unanchored", "withheld_confidential"]),
  /** baseline / window / definition / source … → what you gave or "missing". */
  parts: z.record(z.string(), z.string()),
});

export const reviewSpeechSchema = z.object({
  words: z.number().int(),
  duration_sec: z.number().nullable(),
  words_per_minute: z.number().nullable(),
  filler_count: z.number().int(),
  fillers_per_100_words: z.number(),
  top_fillers: z.array(z.string()),
  /** Team 4 extras (voice answers only). */
  filler_words: z.record(z.string(), z.number().int()).default({}),
  repetitions: z.array(z.string()).default([]),
  long_pauses: z.number().int().default(0),
  longest_pause_sec: z.number().default(0),
  fluency_score: z.number().nullable().default(null),
});

export const reviewAnswerSchema = z.object({
  answer_id: z.string(),
  question_id: z.string(),
  question: z.string(),
  /** What kind of turn produced this answer (main question, follow-up, rephrase…). */
  kind: z.string(),
  answer: z.string(),
  scores: z.array(
    z.object({
      competency_id: z.string(),
      name: z.string(),
      score: z.number().int().min(0).max(5),
      evidence_grade: z.string(),
      evidence: z.array(z.string()),
      missing: z.array(z.string()),
    }),
  ),
  /** Evidence-quality patterns the evaluator flagged, translated to plain language. */
  watch_outs: z.array(
    z.object({ label: z.string(), quote: z.string(), severity: z.number().int() }),
  ),
  /** Candid signals credited to the answer. */
  good_moves: z.array(z.object({ label: z.string(), quote: z.string() })),
  /** The follow-up the interviewer asked because of this answer, if any. */
  follow_up_asked: z.string().nullable(),
  speech: reviewSpeechSchema.nullable(),
  presence: z
    .object({
      camera_facing_percent: z.number(),
      upright_posture_percent: z.number(),
      camera_presence_percent: z.number(),
      gaze_away_events: z.number().int(),
      high_movement_periods: z.number().int(),
    })
    .nullable(),
});

export const practiceReviewSchema = z.object({
  session_id: z.string(),
  job_title: z.string(),
  seniority: z.string(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  duration_minutes: z.number(),
  questions_answered: z.number().int(),
  /** Report from Prompt 04; null when it could not be generated (the per-answer section still works). */
  report: z
    .object({
      overall_score: z.number().nullable(),
      recommendation: z.string(),
      headline: z.string(),
      rationale: z.string(),
      competencies: z.array(reviewCompetencySchema),
      strengths: z.array(z.string()),
      gaps: z.array(z.string()),
      practice_suggestions: z.array(z.string()),
      unverified_claims: z.array(z.string()),
      /** Every material claim you made and where it ended up. */
      claims: z.array(reviewClaimSchema),
      /** Every number you mentioned and which parts (baseline, window, source…) were missing. */
      metrics: z.array(reviewMetricSchema),
      /** Recurring answer patterns across the interview, in plain language. */
      patterns: z.array(
        z.object({ label: z.string(), occurrences: z.number().int(), example: z.string() }),
      ),
      /** How specific your answers got as the interviewer pushed. */
      pressure: z.object({
        narrative: z.string(),
        by_question: z.array(z.object({ question_id: z.string(), direction: z.string() })),
      }),
    })
    .nullable(),
  report_error: z.string().nullable(),
  answers: z.array(reviewAnswerSchema),
  speech_summary: z
    .object({
      total_words: z.number().int(),
      average_words_per_minute: z.number().nullable(),
      fillers_per_100_words: z.number(),
      notes: z.array(z.string()),
      /** Team 4 aggregate over voice answers. */
      filler_words: z.record(z.string(), z.number().int()).default({}),
      repetition_count: z.number().int().default(0),
      long_pauses: z.number().int().default(0),
      longest_pause_sec: z.number().default(0),
      fluency_score: z.number().nullable().default(null),
      source: z.string().nullable().default(null),
    })
    .nullable(),
  presence_summary: z
    .object({
      note: z.string(),
      camera_facing_percent: z.number(),
      upright_posture_percent: z.number(),
      camera_presence_percent: z.number(),
      gaze_away_events: z.number().int(),
      high_movement_periods: z.number().int(),
      coaching: z.array(z.string()),
    })
    .nullable(),
  presence_status: z.enum(["available", "camera_off", "no_consent", "no_data"]),
});
export type PracticeReview = z.infer<typeof practiceReviewSchema>;
export type ReviewAnswer = z.infer<typeof reviewAnswerSchema>;

export const practiceSessionListSchema = z.object({
  items: z.array(
    z.object({
      token: z.string(),
      job_title: z.string(),
      candidate_label: z.string(),
      status: z.string(),
      created_at: z.string(),
      ended_at: z.string().nullable(),
      questions_answered: z.number().int(),
    }),
  ),
});
export type PracticeSessionList = z.infer<typeof practiceSessionListSchema>;
