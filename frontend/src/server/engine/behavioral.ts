import "server-only";
import { z } from "zod";
import type { BodyLanguageResult } from "../bodyLanguage";
import type { Team4Speech } from "../whisper";

/**
 * 00 §12 — behavioral signals. This module is the ONLY place behavioral data is shaped:
 *   - `buildEnvelope`: Team 3 measurements → `behavioral_signals/1.0` (strict schema + denylist)
 *   - `behavioralToAttention`: envelope vs the candidate's own warm-up baseline → attention flags
 * Attention flags reach Prompt 02 only. Nothing here is imported by the 03/04 payload builders.
 */

export const SIGNAL_SCHEMA_VERSION = "behavioral_signals/1.0";
export const FUSION_RULES_VERSION = "fusion_rules/1.0-gaze-body";

const MIN_METRIC_CONFIDENCE = 0.6;
const MIN_PRODUCER_COVERAGE = 0.7;
/** Frames needed before a metric is considered fully confident (~2.5 s at 8 fps). */
const CONFIDENT_FRAMES = 20;
/** Own-baseline drop in on-screen ratio that raises `gaze_shift` (percent, negative = less on-screen). */
const GAZE_SHIFT_MED_PCT = -20;
const GAZE_SHIFT_HIGH_PCT = -40;
const SUSTAINED_OFF_SCREEN_MIN_MS = 3000;
/** `long_pause`: longest silence at least this long AND at least double the warm-up baseline. */
const LONG_PAUSE_MED_MS = 4000;
const LONG_PAUSE_HIGH_MS = 8000;
/** `speech_rate_shift`: words/min change vs the candidate's own baseline (percent). */
const RATE_SHIFT_SLOW_PCT = -35;
const RATE_SHIFT_FAST_PCT = 50;
/** Team 4 counts words from the transcript; below this an answer is too short to judge pace. */
const MIN_SPEECH_WORDS = 15;

/** Camera producer absent (typed answer, camera off, service down). */
const EMPTY_DERIVED: BodyLanguageResult["derived"] = {
  calibrated: false,
  duration_ms: 0,
  frames_total: 0,
  frames_detected: 0,
  coverage_ratio: 0,
  on_screen_ratio: 0,
  off_screen_saccade_count: 0,
  sustained_off_screen_ms_max: 0,
  off_screen_events: [],
  face_visible_ratio: 0,
  posture_shift_count: 0,
  face_out_of_frame_ms: 0,
  face_absent_events: [],
  processing_latency_ms: 0,
  analysis_mode: "rule_based",
  service_version: "none",
};

/** §12.1 denylist: any of these keys at any depth rejects the whole envelope. */
const DENYLIST = new Set([
  "emotion",
  "affect",
  "stress",
  "anxiety",
  "nervousness",
  "confidence_label",
  "deception",
  "honesty",
  "personality",
  "engagement",
  "age",
  "gender",
  "ethnicity",
  "accent",
  "attractiveness",
  "disability",
  "health",
  "face_embedding",
  "raw_frames",
  "raw_audio",
]);

const metric = z
  .object({
    value: z.number(),
    confidence: z.number().min(0).max(1),
    baseline_delta_pct: z.number().nullable(),
  })
  .strict();

const timedEvent = z
  .object({
    type: z.string(),
    at_ms: z.number().int().min(0),
    duration_ms: z.number().int().min(0),
  })
  .strict();

export const envelopeSchema = z
  .object({
    schema_version: z.literal(SIGNAL_SCHEMA_VERSION),
    session_id: z.string(),
    answer_id: z.string(),
    question_id: z.string(),
    turn_index: z.number().int(),
    window: z
      .object({
        start_ms: z.number().int().min(0),
        end_ms: z.number().int().min(0),
        answer_duration_ms: z.number().int().min(0),
        clock: z.literal("server"),
      })
      .strict(),
    calibration: z.boolean(),
    producers: z.array(
      z
        .object({
          service: z.enum(["speech_features", "fluency", "gaze", "body", "fusion"]),
          model_version: z.string(),
          status: z.enum(["ok", "degraded", "missing"]),
          coverage_ratio: z.number().min(0).max(1),
          processing_latency_ms: z.number().int().min(0),
        })
        .strict(),
    ),
    speech: z
      .object({
        words_per_minute: metric,
        filler_rate_per_min: metric,
        pause_count_over_2s: metric,
        longest_pause_ms: metric,
        restart_count: metric,
        asr_confidence_mean: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    fluency: z
      .object({
        hesitation_score: metric,
        reading_cadence_score: metric,
        events: z.array(timedEvent),
      })
      .strict()
      .optional(),
    gaze: z
      .object({
        on_screen_ratio: metric,
        off_screen_saccade_count: metric,
        sustained_off_screen_ms_max: metric,
        off_screen_direction_consistency: metric,
        events: z.array(timedEvent),
      })
      .strict(),
    body: z
      .object({
        face_visible_ratio: metric,
        posture_shift_count: metric,
        face_out_of_frame_ms: metric,
      })
      .strict(),
    environment: z
      .object({
        audio_dropout_ms: z.number().int().min(0),
        video_dropout_ms: z.number().int().min(0),
        network_quality: z.enum(["good", "fair", "poor"]),
      })
      .strict(),
    integrity_events: z.array(
      z
        .object({
          type: z.enum(["multiple_faces_detected", "background_speech_detected", "face_absent"]),
          at_ms: z.number().int().min(0),
          duration_ms: z.number().int().min(0),
          confidence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    baseline_delta: z
      .object({
        words_per_minute_pct: z.number().nullable(),
        filler_rate_pct: z.number().nullable(),
        on_screen_ratio_pct: z.number().nullable(),
      })
      .strict(),
  })
  .strict();

export type BehavioralEnvelope = z.infer<typeof envelopeSchema>;

export type AttentionFlagName =
  | "possible_external_reading"
  | "hesitation_after_claim"
  | "cadence_shift_on_verification"
  | "latency_mismatch"
  | "long_pause"
  | "speech_rate_shift"
  | "gaze_shift"
  | "signals_unavailable";

export interface AttentionFlagItem {
  flag: AttentionFlagName;
  strength: "low" | "med" | "high";
  span_hint_text: string | null;
}

export type FlagsAvailability = "full" | "partial" | "none";

/** Throws when a denylisted key appears anywhere in the object graph (§12.1). */
export function assertNoDenylistedKeys(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoDenylistedKeys(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (DENYLIST.has(key.toLowerCase()))
        throw new Error(`behavioral envelope rejected: denylisted key "${key}" at ${path}`);
      assertNoDenylistedKeys(child, `${path}.${key}`);
    }
  }
}

function pct(current: number, baseline: number | null | undefined): number | null {
  if (baseline === null || baseline === undefined || baseline === 0) return null;
  return Number((((current - baseline) / baseline) * 100).toFixed(2));
}

function metricOf(
  value: number,
  confidence: number,
  baseline: number | null | undefined,
): z.infer<typeof metric> {
  return { value, confidence, baseline_delta_pct: pct(value, baseline) };
}

/**
 * Team 3 result → envelope. `baseline` is the warm-up answer's envelope (null for the warm-up
 * itself). Speech/fluency producers are declared `missing`: Team 2 delivers transcripts, not
 * prosody, so no speech-derived flag can ever fire.
 */
export function buildEnvelope(input: {
  session_id: string;
  answer_id: string;
  question_id: string;
  turn_index: number;
  calibration: boolean;
  /** Team 3 camera result; null when no frames were captured for this answer. */
  result: BodyLanguageResult | null;
  /** Team 4 speech analysis of the recorded answer; null for typed answers. */
  speech?: Team4Speech | null;
  baseline: BehavioralEnvelope | null;
}): BehavioralEnvelope {
  const d = input.result?.derived ?? EMPTY_DERIVED;
  const sp = input.speech ?? null;
  const speechOk = !!sp && sp.total_words >= MIN_SPEECH_WORDS && sp.duration >= 2;
  const speechConfidence = speechOk ? 1 : sp ? 0.4 : 0;
  const fillerRate =
    sp && sp.duration > 0 ? Number(((sp.filler_count / sp.duration) * 60).toFixed(2)) : 0;
  const sufficiency = Math.min(1, d.frames_detected / CONFIDENT_FRAMES);
  const confidence = Number((Math.min(1, d.coverage_ratio) * sufficiency).toFixed(3));
  const status =
    d.frames_total === 0
      ? "missing"
      : d.coverage_ratio >= MIN_PRODUCER_COVERAGE && d.calibrated
        ? "ok"
        : "degraded";
  const b = input.baseline;
  const modelVersion = `team3-${d.analysis_mode}/${d.service_version}`;
  const candidate = {
    schema_version: SIGNAL_SCHEMA_VERSION,
    session_id: input.session_id,
    answer_id: input.answer_id,
    question_id: input.question_id,
    turn_index: input.turn_index,
    window: {
      start_ms: 0,
      end_ms: d.duration_ms,
      answer_duration_ms: d.duration_ms,
      clock: "server",
    },
    calibration: input.calibration,
    producers: [
      {
        service: "speech_features",
        model_version: sp ? `team4/${sp.source.split("@")[1] ?? "notebook"}` : "none",
        status: speechOk ? "ok" : sp ? "degraded" : "missing",
        coverage_ratio: sp ? 1 : 0,
        processing_latency_ms: 0,
      },
      {
        service: "fluency",
        model_version: sp ? `team4/${sp.source.split("@")[1] ?? "notebook"}` : "none",
        status: speechOk ? "ok" : sp ? "degraded" : "missing",
        coverage_ratio: sp ? 1 : 0,
        processing_latency_ms: 0,
      },
      {
        service: "gaze",
        model_version: modelVersion,
        status,
        coverage_ratio: d.coverage_ratio,
        processing_latency_ms: d.processing_latency_ms,
      },
      {
        service: "body",
        model_version: modelVersion,
        status,
        coverage_ratio: d.coverage_ratio,
        processing_latency_ms: d.processing_latency_ms,
      },
    ],
    ...(sp
      ? {
          speech: {
            words_per_minute: metricOf(sp.wpm, speechConfidence, b?.speech?.words_per_minute.value),
            filler_rate_per_min: metricOf(
              fillerRate,
              speechConfidence,
              b?.speech?.filler_rate_per_min.value,
            ),
            pause_count_over_2s: metricOf(
              sp.long_pauses,
              speechConfidence,
              b?.speech?.pause_count_over_2s.value,
            ),
            longest_pause_ms: metricOf(
              Math.round(sp.longest_pause * 1000),
              speechConfidence,
              b?.speech?.longest_pause_ms.value,
            ),
            restart_count: metricOf(
              sp.repetition_count,
              speechConfidence,
              b?.speech?.restart_count.value,
            ),
            asr_confidence_mean: 1,
          },
          fluency: {
            // Team 4's fluency_score is 100 = clean; hesitation is its complement on a 0-1 scale.
            hesitation_score: metricOf(
              Number((1 - sp.fluency_score / 100).toFixed(3)),
              speechConfidence,
              b?.fluency?.hesitation_score.value,
            ),
            reading_cadence_score: metricOf(0, 0, null),
            events:
              sp.longest_pause >= 2
                ? [
                    {
                      type: "long_pause",
                      at_ms: 0,
                      duration_ms: Math.round(sp.longest_pause * 1000),
                    },
                  ]
                : [],
          },
        }
      : {}),
    gaze: {
      on_screen_ratio: metricOf(d.on_screen_ratio, confidence, b?.gaze.on_screen_ratio.value),
      off_screen_saccade_count: metricOf(
        d.off_screen_saccade_count,
        confidence,
        b?.gaze.off_screen_saccade_count.value,
      ),
      sustained_off_screen_ms_max: metricOf(
        d.sustained_off_screen_ms_max,
        confidence,
        b?.gaze.sustained_off_screen_ms_max.value,
      ),
      // Team 3 reports gaze as CAMERA/LEFT/RIGHT/UP/DOWN per frame but no direction stats; unknown → 0 confidence.
      off_screen_direction_consistency: metricOf(0, 0, null),
      events: d.off_screen_events.map((e) => ({
        type: "off_screen",
        at_ms: e.at_ms,
        duration_ms: e.duration_ms,
      })),
    },
    body: {
      face_visible_ratio: metricOf(
        d.face_visible_ratio,
        confidence,
        b?.body.face_visible_ratio.value,
      ),
      posture_shift_count: metricOf(
        d.posture_shift_count,
        confidence,
        b?.body.posture_shift_count.value,
      ),
      face_out_of_frame_ms: metricOf(
        d.face_out_of_frame_ms,
        confidence,
        b?.body.face_out_of_frame_ms.value,
      ),
    },
    environment: {
      audio_dropout_ms: 0,
      video_dropout_ms: d.face_out_of_frame_ms,
      network_quality: d.coverage_ratio >= 0.9 ? "good" : d.coverage_ratio >= 0.5 ? "fair" : "poor",
    },
    integrity_events: d.face_absent_events.map((e) => ({
      type: "face_absent" as const,
      at_ms: e.at_ms,
      duration_ms: e.duration_ms,
      confidence,
    })),
    baseline_delta: {
      words_per_minute_pct: sp ? pct(sp.wpm, b?.speech?.words_per_minute.value) : null,
      filler_rate_pct: sp ? pct(fillerRate, b?.speech?.filler_rate_per_min.value) : null,
      on_screen_ratio_pct: pct(d.on_screen_ratio, b?.gaze.on_screen_ratio.value),
    },
  };
  assertNoDenylistedKeys(candidate);
  return envelopeSchema.parse(candidate);
}

/**
 * §12.2 fusion — pure. Compares only against the candidate's own baseline, drops low-confidence
 * metrics and low-coverage producers, at most one flag per type, integrity events never flag.
 */
export function behavioralToAttention(
  envelope: BehavioralEnvelope,
  baseline: BehavioralEnvelope | null,
): { flags: AttentionFlagItem[]; availability: FlagsAvailability } {
  const producerOk = (service: "gaze" | "body" | "speech_features") => {
    const producer = envelope.producers.find((p) => p.service === service);
    return (
      !!producer && producer.status === "ok" && producer.coverage_ratio >= MIN_PRODUCER_COVERAGE
    );
  };
  const gazeUsable = producerOk("gaze");
  const bodyUsable = producerOk("body");
  const speechUsable = producerOk("speech_features") && !!envelope.speech;
  const usable = [gazeUsable, bodyUsable, speechUsable].filter(Boolean).length;
  const availability: FlagsAvailability = usable === 3 ? "full" : usable > 0 ? "partial" : "none";
  if (envelope.calibration || !baseline) return { flags: [], availability };

  const flags: AttentionFlagItem[] = [];
  if (speechUsable && envelope.speech && baseline.speech) {
    const pause = envelope.speech.longest_pause_ms;
    if (
      pause.confidence >= MIN_METRIC_CONFIDENCE &&
      pause.value >= LONG_PAUSE_MED_MS &&
      pause.baseline_delta_pct !== null &&
      pause.baseline_delta_pct >= 100
    ) {
      flags.push({
        flag: "long_pause",
        strength: pause.value >= LONG_PAUSE_HIGH_MS ? "high" : "med",
        span_hint_text: null,
      });
    }
    const rate = envelope.speech.words_per_minute;
    if (
      rate.confidence >= MIN_METRIC_CONFIDENCE &&
      rate.baseline_delta_pct !== null &&
      (rate.baseline_delta_pct <= RATE_SHIFT_SLOW_PCT ||
        rate.baseline_delta_pct >= RATE_SHIFT_FAST_PCT)
    ) {
      flags.push({ flag: "speech_rate_shift", strength: "med", span_hint_text: null });
    }
  }
  if (!gazeUsable) return { flags, availability };
  const onScreen = envelope.gaze.on_screen_ratio;
  const sustained = envelope.gaze.sustained_off_screen_ms_max;
  let gazeStrength: AttentionFlagItem["strength"] | null = null;
  if (onScreen.confidence >= MIN_METRIC_CONFIDENCE && onScreen.baseline_delta_pct !== null) {
    if (onScreen.baseline_delta_pct <= GAZE_SHIFT_HIGH_PCT) gazeStrength = "high";
    else if (onScreen.baseline_delta_pct <= GAZE_SHIFT_MED_PCT) gazeStrength = "med";
  }
  if (
    sustained.confidence >= MIN_METRIC_CONFIDENCE &&
    sustained.value >= SUSTAINED_OFF_SCREEN_MIN_MS &&
    sustained.baseline_delta_pct !== null &&
    sustained.baseline_delta_pct >= 100
  ) {
    gazeStrength = gazeStrength === "high" ? "high" : "med";
  }
  if (gazeStrength)
    flags.push({ flag: "gaze_shift", strength: gazeStrength, span_hint_text: null });
  return { flags, availability };
}
