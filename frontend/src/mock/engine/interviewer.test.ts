import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../store";
import { newSession, seed } from "../seed";
import * as engine from "./interviewer";

function fresh() {
  globalThis.__interviewMockDb = undefined;
  seed();
  const requisition = db().requisitions.get("REQ_demo_fpa")!;
  const session = newSession(requisition, "Unit", "en-IN");
  engine.consentGiven(session, {
    ai_interview_notice_ack: true,
    recording_consent: true,
    behavioral_analysis_consent: false,
    notice_version: "v",
  });
  engine.deviceReady(session, { camera: false, microphone: false });
  engine.start(session);
  return session;
}

/** Fast-forward the simulated evaluation delay. */
function settleNow(session: ReturnType<typeof fresh>) {
  session.evaluating_until = 0;
  engine.settle(session);
}

describe("mock interviewer engine", () => {
  beforeEach(() => {
    globalThis.__interviewMockDb = undefined;
  });

  it("starts with the warm-up question and never exposes hidden fields on the DTO", () => {
    const session = fresh();
    expect(session.status).toBe("active");
    expect(session.current_turn?.turn_type).toBe("main_question");
    expect(Object.keys(session.current_turn!).sort()).toEqual(
      [
        "can_request_clarification",
        "candidate_message",
        "max_answer_seconds",
        "phase_label",
        "requires_answer",
        "turn_index",
        "turn_type",
      ].sort(),
    );
  });

  it("asks anchors before the resume-verification question", () => {
    const session = fresh();
    engine.answer(session, "I run the close pack for three plants.");
    settleNow(session);
    expect(session.current_turn?.candidate_message).toMatch(/three quick facts/);
    engine.answer(session, "Analyst; three controllers; four months.");
    settleNow(session);
    expect(session.current_turn?.candidate_message).toMatch(/reducing close reporting time by 30%/);
  });

  it("probes a collective, unanchored answer with OWN first and escalates the budget", () => {
    const session = fresh();
    engine.answer(session, "I run the close pack.");
    settleNow(session);
    engine.answer(session, "Analyst; three controllers; four months.");
    settleNow(session);
    engine.answer(
      session,
      "We brought the close from nine days to five by automating reconciliations. It was a big team effort and leadership was very happy with the 30% improvement.",
    );
    settleNow(session);
    const evaluation = session.evaluations.at(-1)!;
    expect(evaluation.pattern_flags.map((p) => p.pattern)).toContain("B04_collective_ownership");
    expect(evaluation.pattern_flags.map((p) => p.pattern)).toContain("B12_unsupported_metric");
    expect(evaluation.probe_directives[0]?.technique).toBe("OWN");
    expect(evaluation.recommended_next_action).toBe("probe");
    expect(session.probe_budget).toBe(3);
    expect(session.current_turn?.candidate_message).toMatch(/^It is fine to say I here/);
    expect(session.budget_audit.at(-1)?.content_escalation).toBe(true);
  });

  it("credits an honest down-scope, does not re-raise B04, and advances", () => {
    const session = fresh();
    engine.answer(session, "I run the close pack.");
    settleNow(session);
    engine.answer(session, "Analyst; three controllers; four months.");
    settleNow(session);
    engine.answer(
      session,
      "We brought the close from nine days to five. Big team effort, 30% improvement.",
    );
    settleNow(session);
    engine.answer(
      session,
      "Honestly my part was narrower. I wrote the accrual estimation rule for plant overheads; the controller owned the calendar. Before it was nine business days, from the close tracker.",
    );
    settleNow(session);
    const evaluation = session.evaluations.at(-1)!;
    expect(evaluation.candid_signals.map((c) => c.signal)).toContain("honest_down_scope");
    expect(evaluation.pattern_flags.map((p) => p.pattern)).not.toContain(
      "B04_collective_ownership",
    );
    expect(evaluation.recommended_next_action).toBe("advance");
    expect(session.current_turn?.candidate_message).toMatch(/gross margin/);
  });

  it("reveals matching case facts verbatim and otherwise asks the candidate to assume", () => {
    const session = fresh();
    session.plan_index = 2; // jump to the case
    engine.answer(session, "x"); // consumed as an answer to the current turn; advance mechanics not needed here
    session.status = "active";
    session.plan_index = 2;
    session.probes_used = 0;
    engine.answer(session, "Did the freight cost change?");
    settleNow(session);
    expect(session.current_turn?.candidate_message).toMatch(/Freight cost per unit rose 18%/);
    expect(session.current_turn?.candidate_message).toMatch(/Go ahead\.$/);
    engine.answer(session, "Was there a strike?");
    settleNow(session);
    expect(session.current_turn?.candidate_message).toBe(
      "Assume what you need to and tell me your assumptions.",
    );
  });

  it("stop request escalates with the exact script and no further probes", () => {
    const session = fresh();
    engine.request(session, "stop");
    expect(session.status).toBe("escalated");
    expect(session.escalation_reason).toBe("candidate_requested_stop");
    expect(session.current_turn?.candidate_message).toBe(
      "Thank you. We will pause the interview here and a member of the team will follow up with you directly.",
    );
    expect(session.current_turn?.requires_answer).toBe(false);
  });

  it("break then resume repeats the pending question verbatim", () => {
    const session = fresh();
    const pending = session.current_turn!.candidate_message;
    engine.request(session, "break");
    expect(session.status).toBe("paused");
    engine.request(session, "resume");
    expect(session.status).toBe("active");
    expect(session.current_turn?.candidate_message).toBe(pending);
  });

  it("accommodation is granted immediately with the fixed line and recorded", () => {
    const session = fresh();
    engine.adjustment(session, "text_modality");
    expect(session.accommodations).toContain("text_modality");
    expect(session.current_turn?.candidate_message).toBe(
      "Of course. You can type your answers from now on. Would you like me to repeat the question?",
    );
    expect(db().audit.some((event) => event.kind === "accommodation")).toBe(true);
  });

  it("human_interviewer accommodation ends the AI interview via escalation", () => {
    const session = fresh();
    engine.adjustment(session, "human_interviewer");
    expect(session.status).toBe("escalated");
    expect(session.escalation_reason).toBe("accommodation_unavailable");
  });
});
