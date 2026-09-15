import { describe, expect, it } from "vitest";
import type { CandidateSessionView, CandidateTurnDto } from "@/lib/api/schemas/candidate";
import { candidateTurnDtoSchema } from "@/lib/api/schemas/candidate";
import {
  canInteract,
  initialUiState,
  reduce,
  rightsVisible,
  stateFromView,
} from "./interviewMachine";

const turn = (over: Partial<CandidateTurnDto> = {}): CandidateTurnDto => ({
  turn_index: 3,
  turn_type: "main_question",
  candidate_message: "Walk me through one month-end where the old process ran late?",
  requires_answer: true,
  max_answer_seconds: 180,
  can_request_clarification: true,
  phase_label: "interview",
  ...over,
});

const view = (over: Partial<CandidateSessionView> = {}): CandidateSessionView => ({
  session_id: "S1",
  status: "active",
  interview_language: "en-IN",
  interview_modality: "both",
  job_title: "FP&A Analyst",
  company_display_name: "Acme",
  duration_minutes: 45,
  opening_disclosure: "Before we begin…",
  consent: {
    ai_interview_notice_ack: true,
    recording_consent: true,
    behavioral_analysis_consent: false,
    notice_version: "v1",
  },
  accommodations_applied: [],
  current_turn: turn(),
  elapsed_seconds: 120,
  interview_purpose: "mock_practice",
  ...over,
});

describe("stateFromView", () => {
  it("maps every server status to a UI state", () => {
    expect(stateFromView(view({ status: "awaiting_consent" })).kind).toBe("consent");
    expect(stateFromView(view({ status: "device_check" })).kind).toBe("device_check");
    expect(stateFromView(view({ status: "ready" })).kind).toBe("disclosure");
    expect(stateFromView(view({ status: "active" })).kind).toBe("asking");
    expect(stateFromView(view({ status: "evaluating" })).kind).toBe("submitting");
    expect(stateFromView(view({ status: "paused" })).kind).toBe("paused");
    expect(stateFromView(view({ status: "escalated" })).kind).toBe("escalated");
    expect(stateFromView(view({ status: "closed" })).kind).toBe("closing");
  });

  it("routes your-questions and closing turns by turn content", () => {
    expect(
      stateFromView(
        view({
          current_turn: turn({ turn_type: "candidate_questions", phase_label: "your_questions" }),
        }),
      ).kind,
    ).toBe("candidate_questions");
    expect(
      stateFromView(
        view({
          current_turn: turn({
            turn_type: "closing",
            requires_answer: false,
            phase_label: "closing",
          }),
        }),
      ).kind,
    ).toBe("closing");
  });

  it("treats an active session without a turn as waiting on the server", () => {
    expect(stateFromView(view({ current_turn: null })).kind).toBe("submitting");
  });
});

describe("reduce", () => {
  it("goes loading -> asking -> submitting -> asking on the next turn", () => {
    let state = reduce(initialUiState, { type: "LOAD_OK", view: view() });
    expect(state.kind).toBe("asking");
    state = reduce(state, { type: "SUBMIT_START" });
    expect(state.kind).toBe("submitting");
    state = reduce(state, {
      type: "SUBMIT_OK",
      view: view({ current_turn: turn({ turn_index: 4, turn_type: "follow_up" }) }),
    });
    expect(state.kind).toBe("asking");
    if (state.kind === "asking") expect(state.turn.turn_index).toBe(4);
  });

  it("ignores a stale server push while submitting but accepts a new turn", () => {
    let state = reduce(initialUiState, { type: "LOAD_OK", view: view() });
    state = reduce(state, { type: "SUBMIT_START" });
    const stale = reduce(state, { type: "SERVER_PUSH", view: view() });
    expect(stale.kind).toBe("submitting");
    const fresh = reduce(state, {
      type: "SERVER_PUSH",
      view: view({ current_turn: turn({ turn_index: 4 }) }),
    });
    expect(fresh.kind).toBe("asking");
  });

  it("keeps the previous state behind an error and restores it on RETRY", () => {
    let state = reduce(initialUiState, { type: "LOAD_OK", view: view() });
    state = reduce(state, { type: "SUBMIT_FAIL", message: "offline", retryable: true });
    expect(state.kind).toBe("error");
    state = reduce(state, { type: "RETRY" });
    expect(state.kind).toBe("asking");
  });

  it("an escalation push always wins", () => {
    let state = reduce(initialUiState, { type: "LOAD_OK", view: view() });
    state = reduce(state, { type: "REQUEST_START" });
    state = reduce(state, {
      type: "SERVER_PUSH",
      view: view({ status: "escalated", current_turn: null }),
    });
    expect(state.kind).toBe("escalated");
  });
});

describe("guards", () => {
  it("only lets the candidate act when a turn is on screen or paused", () => {
    expect(canInteract(reduce(initialUiState, { type: "LOAD_OK", view: view() }))).toBe(true);
    expect(
      canInteract(
        reduce(initialUiState, { type: "LOAD_OK", view: view({ status: "evaluating" }) }),
      ),
    ).toBe(false);
    expect(
      rightsVisible(
        reduce(initialUiState, { type: "LOAD_OK", view: view({ status: "awaiting_consent" }) }),
      ),
    ).toBe(false);
    expect(rightsVisible(reduce(initialUiState, { type: "LOAD_OK", view: view() }))).toBe(true);
  });
});

describe("candidate_turn_dto whitelist", () => {
  it("rejects any extra key so hidden fields can never render", () => {
    const leaked = { ...turn(), hidden_turn_note: { technique: "OWN" } };
    expect(candidateTurnDtoSchema.safeParse(leaked).success).toBe(false);
    expect(candidateTurnDtoSchema.safeParse(turn()).success).toBe(true);
  });
});
