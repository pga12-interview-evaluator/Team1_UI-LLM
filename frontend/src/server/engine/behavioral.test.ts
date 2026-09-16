import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { assertNoDenylistedKeys, behavioralToAttention, buildEnvelope, envelopeSchema } =
  await import("./behavioral");
type Result = NonNullable<Parameters<typeof buildEnvelope>[0]["result"]>;

function result(over: Partial<Result["derived"]> = {}): Result {
  return {
    turn_index: 3,
    report: { camera_facing_gaze_percent: 90 },
    percentages: { overall_percent: 70 },
    interval_seconds: 5,
    intervals: [],
    derived: {
      calibrated: true,
      duration_ms: 20_000,
      frames_total: 160,
      frames_detected: 150,
      coverage_ratio: 0.94,
      on_screen_ratio: 0.9,
      off_screen_saccade_count: 1,
      sustained_off_screen_ms_max: 1800,
      off_screen_events: [{ at_ms: 4000, duration_ms: 1800 }],
      face_visible_ratio: 0.94,
      posture_shift_count: 2,
      face_out_of_frame_ms: 1200,
      face_absent_events: [],
      processing_latency_ms: 900,
      analysis_mode: "rule_based",
      service_version: "1.0.0",
      ...over,
    },
  };
}

function envelope(
  over: Partial<Result["derived"]> = {},
  calibration = false,
  baseline = null as ReturnType<typeof buildEnvelope> | null,
) {
  return buildEnvelope({
    session_id: "S_1",
    answer_id: calibration ? "A_Q1_0" : "A_Q3_0",
    question_id: calibration ? "Q1" : "Q3",
    turn_index: calibration ? 1 : 3,
    calibration,
    result: result(over),
    baseline,
  });
}

describe("buildEnvelope (00 §12.1)", () => {
  it("produces a strict, denylist-free envelope with gaze/body producers and missing speech producers", () => {
    const env = envelope({}, true);
    expect(envelopeSchema.safeParse(env).success).toBe(true);
    expect(env.producers.map((p) => `${p.service}:${p.status}`)).toEqual([
      "speech_features:missing",
      "fluency:missing",
      "gaze:ok",
      "body:ok",
    ]);
    expect(env.baseline_delta.on_screen_ratio_pct).toBeNull();
    expect(env.integrity_events).toEqual([]);
  });

  it("computes own-baseline deltas and logs face_absent as an integrity event, never a flag", () => {
    const base = envelope({}, true);
    const env = envelope(
      { on_screen_ratio: 0.45, face_absent_events: [{ at_ms: 100, duration_ms: 3500 }] },
      false,
      base,
    );
    expect(env.gaze.on_screen_ratio.baseline_delta_pct).toBe(-50);
    expect(env.integrity_events[0]?.type).toBe("face_absent");
    const { flags } = behavioralToAttention(env, base);
    expect(flags.every((f) => f.flag !== "signals_unavailable")).toBe(true);
  });

  it("rejects denylisted keys at any depth", () => {
    expect(() => assertNoDenylistedKeys({ gaze: { events: [{ stress: 1 }] } })).toThrow(/stress/);
    expect(() => assertNoDenylistedKeys({ ok: { nested: { value: 1 } } })).not.toThrow();
  });

  it("marks the producer degraded when calibration never completed or coverage is low", () => {
    expect(envelope({ calibrated: false }).producers[2]?.status).toBe("degraded");
    expect(envelope({ coverage_ratio: 0.5 }).producers[2]?.status).toBe("degraded");
    expect(envelope({ frames_total: 0, frames_detected: 0 }).producers[2]?.status).toBe("missing");
  });
});

describe("behavioralToAttention (00 §12.2)", () => {
  const base = envelope({}, true);

  it("never flags the calibration answer or an answer without a baseline", () => {
    expect(behavioralToAttention(base, null).flags).toEqual([]);
    expect(behavioralToAttention(envelope({ on_screen_ratio: 0.2 }), null).flags).toEqual([]);
  });

  it("raises gaze_shift med / high from the candidate's own baseline only", () => {
    expect(
      behavioralToAttention(envelope({ on_screen_ratio: 0.7 }, false, base), base).flags,
    ).toEqual([{ flag: "gaze_shift", strength: "med", span_hint_text: null }]);
    expect(
      behavioralToAttention(envelope({ on_screen_ratio: 0.5 }, false, base), base).flags,
    ).toEqual([{ flag: "gaze_shift", strength: "high", span_hint_text: null }]);
    expect(
      behavioralToAttention(envelope({ on_screen_ratio: 0.85 }, false, base), base).flags,
    ).toEqual([]);
  });

  it("drops low-confidence metrics and low-coverage producers, reporting partial/none availability", () => {
    const few = envelope(
      { on_screen_ratio: 0.3, frames_detected: 6, coverage_ratio: 0.5 },
      false,
      base,
    );
    const out = behavioralToAttention(few, base);
    expect(out.flags).toEqual([]);
    expect(out.availability).toBe("none");
    const shaky = envelope({ on_screen_ratio: 0.3, frames_detected: 8 }, false, base);
    expect(behavioralToAttention(shaky, base).flags).toEqual([]);
  });

  it("emits at most one flag per type and no numeric field survives into a flag", () => {
    const env = envelope({ on_screen_ratio: 0.4, sustained_off_screen_ms_max: 9000 }, false, base);
    const { flags } = behavioralToAttention(env, base);
    expect(flags).toHaveLength(1);
    expect(Object.keys(flags[0]!)).toEqual(["flag", "strength", "span_hint_text"]);
  });
});

describe("Team 4 speech producer (00 §12.1 speech/fluency)", () => {
  const speech = (
    over: Partial<NonNullable<Parameters<typeof buildEnvelope>[0]["speech"]>> = {},
  ) => ({
    duration: 40,
    total_words: 90,
    wpm: 135,
    filler_count: 3,
    filler_words: { um: 2, like: 1 },
    repetition_count: 1,
    repetitions: ["the"],
    total_pauses: 2,
    long_pauses: 1,
    average_pause: 1.8,
    longest_pause: 2.4,
    fluency_score: 90.5,
    source: "team4/team4_capstone.ipynb@0a96cd5",
    ...over,
  });
  const withSpeech = (
    over: Parameters<typeof speech>[0],
    calibration: boolean,
    baseline: ReturnType<typeof buildEnvelope> | null,
  ) =>
    buildEnvelope({
      session_id: "S_1",
      answer_id: calibration ? "A_Q1_0" : "A_Q3_0",
      question_id: calibration ? "Q1" : "Q3",
      turn_index: calibration ? 1 : 3,
      calibration,
      result: null,
      speech: speech(over),
      baseline,
    });

  it("builds a speech-only envelope for a typed-camera-off voice answer", () => {
    const env = withSpeech({}, true, null);
    expect(env.producers.map((p) => `${p.service}:${p.status}`)).toEqual([
      "speech_features:ok",
      "fluency:ok",
      "gaze:missing",
      "body:missing",
    ]);
    expect(env.speech?.words_per_minute.value).toBe(135);
    expect(env.fluency?.hesitation_score.value).toBeCloseTo(0.095, 3);
    expect(env.fluency?.events[0]?.type).toBe("long_pause");
  });

  it("flags long_pause and speech_rate_shift only against the candidate's own baseline", () => {
    const base = withSpeech({}, true, null);
    const paused = withSpeech({ longest_pause: 9, wpm: 60 }, false, base);
    const { flags, availability } = behavioralToAttention(paused, base);
    expect(availability).toBe("partial");
    expect(flags).toEqual([
      { flag: "long_pause", strength: "high", span_hint_text: null },
      { flag: "speech_rate_shift", strength: "med", span_hint_text: null },
    ]);
    expect(
      behavioralToAttention(withSpeech({ longest_pause: 2.6 }, false, base), base).flags,
    ).toEqual([]);
  });

  it("degrades the producer on very short answers so nothing flags", () => {
    const base = withSpeech({}, true, null);
    const tiny = withSpeech({ total_words: 4, longest_pause: 12 }, false, base);
    expect(tiny.producers[0]?.status).toBe("degraded");
    expect(behavioralToAttention(tiny, base).flags).toEqual([]);
  });
});
