import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { buildAssessmentInput, buildSessionState } = await import("./state");
type Session = Parameters<typeof buildSessionState>[0];

function session(): Session {
  return {
    session_id: "S_1",
    started_at: new Date().toISOString(),
    interview_input: {
      interview_language: "en-IN",
      duration_minutes: 20,
      interview_purpose: "mock_practice",
    },
    policy_snapshot: { pressure_level: "standard" },
    blueprint: { role_summary: {}, competencies: [], resume_claims: [], interview_plan: [] },
    accommodations: [],
    current_question_id: "Q1",
    completed_question_ids: [],
    skipped_question_ids: [],
    probe_index: 0,
    probe_budget_remaining: 2,
    probe_budget_reason: "base 2",
    probe_pool_remaining: 6,
    reframe_used: false,
    evaluator_directives: [],
    callbacks_remaining: 2,
    reconciliations_remaining: 1,
    premises_remaining: 1,
    mutations_used: [],
    case_state: null,
    digests: [],
    transcript: [],
    ledger: [],
    phase: "main",
  } as unknown as Session;
}

describe("behavioral firewall (00 §12)", () => {
  it("omits attention_flags from session_state when capture is disabled and includes [] when on", () => {
    const off = buildSessionState(session(), "hello", [], undefined) as Record<string, unknown>;
    expect("attention_flags" in off).toBe(false);
    const on = buildSessionState(session(), "hello", [], []) as Record<string, unknown>;
    expect(on.attention_flags).toEqual([]);
    const flagged = buildSessionState(
      session(),
      "hello",
      [],
      [{ flag: "gaze_shift", strength: "high", span_hint_text: null }],
    ) as Record<string, unknown>;
    expect(flagged.attention_flags).toEqual([
      { flag: "gaze_shift", strength: "high", span_hint_text: null },
    ]);
  });

  it("keeps every behavioral namespace out of the 03 assessment input", () => {
    const input = JSON.stringify(
      buildAssessmentInput(
        session(),
        { text: "answer", answer_id: "A_Q1_0" },
        {
          text: "q",
          turn_type: "main_question",
          technique: "NONE",
          source: "blueprint_verbatim",
          directive: null,
        },
        [],
      ),
    );
    for (const key of ["attention_flags", "behavioral", "gaze", "posture", "on_screen_ratio"])
      expect(input.includes(`"${key}`)).toBe(false);
  });
});
