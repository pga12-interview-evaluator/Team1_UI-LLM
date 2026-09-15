import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { applyBudgetRules } = await import("./state");
type Session = Parameters<typeof applyBudgetRules>[0];

function session(over: Partial<Session> = {}): Session {
  return {
    policy_snapshot: { probe_budget_base: 2, probe_hard_cap_per_question: 4 },
    probe_index: 0,
    probe_budget_remaining: 2,
    probe_budget_reason: "base 2",
    probe_pool_remaining: 6,
    ...over,
  } as unknown as Session;
}

describe("applyBudgetRules (00 §14)", () => {
  it("escalates once when two moderate patterns fire on a generic answer", () => {
    const s = session();
    const row = applyBudgetRules(
      s,
      {
        pattern_flags: [
          { pattern: "B04_collective_ownership", severity: 2 },
          { pattern: "B12_unsupported_metric", severity: 2 },
        ],
        candid_signals: [],
        competency_scores: [{ evidence_grade: "generic" }],
        recommended_next_action: "probe",
      },
      "A_Q2_0",
    );
    expect(row.content_escalation).toBe(true);
    expect(s.probe_budget_remaining).toBe(3);
    expect(row.backend_decision).toBe("probe");
  });

  it("does not escalate twice and never exceeds the cap", () => {
    const s = session({
      probe_budget_reason: "base 2 + content escalation 1 (x)",
      probe_budget_remaining: 1,
      probe_index: 2,
    });
    applyBudgetRules(
      s,
      {
        pattern_flags: [{ pattern: "B01_keyword_stack", severity: 3 }],
        candid_signals: [],
        competency_scores: [{ evidence_grade: "none" }],
      },
      "A",
    );
    expect(s.probe_budget_remaining).toBe(1);
  });

  it("de-escalates to zero on verification detail with no patterns", () => {
    const s = session();
    const row = applyBudgetRules(
      s,
      {
        pattern_flags: [],
        candid_signals: [],
        competency_scores: [{ evidence_grade: "specific_with_verification_detail" }],
        recommended_next_action: "probe",
      },
      "A",
    );
    expect(s.probe_budget_remaining).toBe(0);
    expect(row.backend_decision).toBe("advance");
  });

  it("a candid signal with no patterns costs one probe", () => {
    const s = session();
    applyBudgetRules(
      s,
      {
        pattern_flags: [],
        candid_signals: [{ signal: "honest_down_scope" }],
        competency_scores: [{ evidence_grade: "specific" }],
      },
      "A",
    );
    expect(s.probe_budget_remaining).toBe(1);
  });
});

describe("attention boost (00 §14 rule 3)", () => {
  const escalating = {
    pattern_flags: [
      { pattern: "B04_collective_ownership", severity: 2 },
      { pattern: "B12_unsupported_metric", severity: 2 },
    ],
    candid_signals: [],
    competency_scores: [{ evidence_grade: "generic" }],
    recommended_next_action: "probe",
  };

  it("adds +1 only on top of a content escalation with a high flag, within the cap", () => {
    const s = session({
      policy_snapshot: {
        probe_budget_base: 2,
        probe_hard_cap_per_question: 4,
        behavioral_boost_max: 1,
      },
    });
    const row = applyBudgetRules(s, escalating, "A", true);
    expect(row.content_escalation).toBe(true);
    expect(row.attention_boost).toBe(true);
    expect(s.probe_budget_remaining).toBe(4);
    expect(s.probe_budget_reason).toMatch(/attention boost 1/);
  });

  it("never boosts alone, at calm (boost_max 0), or when capture is off", () => {
    const calm = session({
      policy_snapshot: {
        probe_budget_base: 1,
        probe_hard_cap_per_question: 3,
        behavioral_boost_max: 0,
      },
    });
    expect(applyBudgetRules(calm, escalating, "A", true).attention_boost).toBe(false);
    const quiet = session({
      policy_snapshot: {
        probe_budget_base: 2,
        probe_hard_cap_per_question: 4,
        behavioral_boost_max: 1,
      },
    });
    const row = applyBudgetRules(
      quiet,
      { ...escalating, pattern_flags: [], competency_scores: [{ evidence_grade: "specific" }] },
      "A",
      true,
    );
    expect(row.attention_boost).toBe(false);
    expect(quiet.probe_budget_remaining).toBe(2);
    const off = session({
      policy_snapshot: {
        probe_budget_base: 2,
        probe_hard_cap_per_question: 4,
        behavioral_boost_max: 1,
      },
    });
    expect(applyBudgetRules(off, escalating, "A", false).attention_boost).toBe(false);
  });
});
