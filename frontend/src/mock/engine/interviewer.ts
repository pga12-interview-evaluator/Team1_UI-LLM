import type { AccommodationCode, CandidateTurnDto, PhaseLabel } from "@/lib/api/schemas/candidate";
import type { BudgetAuditRow, EvaluationSummary, TranscriptEntry } from "@/lib/api/schemas/console";
import { PLAN, type MockPlanItem } from "../fixtures/plan";
import { ACCOMMODATION_EFFECT, SCRIPTS } from "../fixtures/scripts";
import { audit, publish, type MockSession } from "../store";

const EVALUATION_DELAY_MS = 1800;
const MAX_ANSWER_SECONDS = 180;
const CASE_ANSWER_SECONDS = 240;

/* ---------------- helpers ---------------- */

function now(): string {
  return new Date().toISOString();
}

function currentItem(session: MockSession): MockPlanItem | null {
  return PLAN[session.plan_index] ?? null;
}

function dto(
  session: MockSession,
  message: string,
  turnType: CandidateTurnDto["turn_type"],
  requiresAnswer: boolean,
  phase: PhaseLabel,
): CandidateTurnDto {
  const item = currentItem(session);
  const unlimited = session.accommodations.includes("extended_answer_time");
  return {
    turn_index: session.turn_index,
    turn_type: turnType,
    candidate_message: message,
    requires_answer: requiresAnswer,
    max_answer_seconds: unlimited
      ? 3600
      : item?.question_type === "case"
        ? CASE_ANSWER_SECONDS
        : MAX_ANSWER_SECONDS,
    can_request_clarification: item?.question_type === "case",
    phase_label: phase,
  };
}

function pushInterviewer(
  session: MockSession,
  text: string,
  meta: Partial<TranscriptEntry> = {},
): void {
  session.turn_index += 1;
  session.transcript.push({
    turn_index: session.turn_index,
    role: "interviewer",
    question_id: currentItem(session)?.question_id ?? null,
    answer_id: null,
    turn_type: meta.turn_type ?? "main_question",
    technique: meta.technique ?? "NONE",
    target_claim_ids: meta.target_claim_ids ?? [],
    probe_index: meta.probe_index ?? null,
    ladder_rung: null,
    is_callback: false,
    text,
    committed_at: now(),
    source: meta.source ?? "model",
  });
}

function pushCandidate(session: MockSession, text: string): string {
  const item = currentItem(session);
  const answerId = item
    ? `A_${item.question_id}_${session.probes_used}`
    : `A_misc_${session.turn_index}`;
  session.turn_index += 1;
  session.transcript.push({
    turn_index: session.turn_index,
    role: "candidate",
    question_id: item?.question_id ?? null,
    answer_id: answerId,
    turn_type: null,
    technique: null,
    target_claim_ids: [],
    probe_index: session.probes_used,
    ladder_rung: null,
    is_callback: false,
    text,
    committed_at: now(),
    source: "candidate",
  });
  return answerId;
}

/** Set a turn, either immediately or after a simulated evaluation delay. */
function setTurn(
  session: MockSession,
  turn: CandidateTurnDto,
  { evaluate }: { evaluate: boolean },
): void {
  session.pending_question_text = turn.requires_answer
    ? turn.candidate_message
    : session.pending_question_text;
  if (evaluate) {
    session.status = "evaluating";
    session.current_turn = null;
    session.evaluating_until = Date.now() + EVALUATION_DELAY_MS;
    session.next_after_evaluation = turn;
  } else {
    session.current_turn = turn;
    session.evaluating_until = null;
    session.next_after_evaluation = null;
  }
  publish(session);
}

/** Called on every read: releases a pending turn once the simulated evaluation delay has passed. */
export function settle(session: MockSession): void {
  if (
    session.status === "evaluating" &&
    session.evaluating_until !== null &&
    Date.now() >= session.evaluating_until
  ) {
    const next = session.next_after_evaluation;
    session.evaluating_until = null;
    session.next_after_evaluation = null;
    if (next) {
      session.current_turn = next;
      session.status =
        next.phase_label === "your_questions"
          ? "candidate_questions"
          : next.turn_type === "closing"
            ? "closed"
            : "active";
      if (next.turn_type === "closing") session.ended_at = now();
    }
    publish(session);
  }
}

/* ---------------- mock "evaluator" heuristics (stand-in for Prompt 03) ---------------- */

type Trigger = "collective" | "unanchored_metric" | "generic" | "no_failure" | "adjacent";

function detect(
  answer: string,
  item: MockPlanItem,
): {
  triggers: Trigger[];
  patterns: EvaluationSummary["pattern_flags"];
  candid: EvaluationSummary["candid_signals"];
  score: number;
} {
  const text = answer.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const triggers: Trigger[] = [];
  const patterns: EvaluationSummary["pattern_flags"] = [];
  const candid: EvaluationSummary["candid_signals"] = [];

  const firstPerson = /\b(i|my|me|i'd|i've)\b/.test(text);
  const collective = /\b(we|our|us|the team|team effort)\b/.test(text) && !firstPerson;
  if (collective && item.question_type !== "warm_up") {
    triggers.push("collective");
    patterns.push({ pattern: "B04_collective_ownership", quote: answer.slice(0, 80), severity: 2 });
  }
  const hasNumber = /\d+\s*%|\d+\s*(days|weeks|months|x|percent)/.test(text);
  // A number counts as anchored only when a source or window is named (mirrors Prompt 03 METRIC parts).
  const anchored =
    /(tracker|report|dashboard|system|ledger|measured|compared|over (?:the )?(?:next|last|following)|from the)/.test(
      text,
    );
  if (hasNumber && !anchored) {
    triggers.push("unanchored_metric");
    patterns.push({
      pattern: "B12_unsupported_metric",
      quote: answer.match(/\d+[^.]{0,40}/)?.[0] ?? answer.slice(0, 40),
      severity: 2,
    });
  }
  const generic =
    words < 25 ||
    /\b(best practice|streamlin|leverag|synerg|stakeholders were happy|very happy|big impact)\b/.test(
      text,
    );
  if (generic && item.question_type !== "warm_up") {
    triggers.push("generic");
    patterns.push({
      pattern: words < 25 ? "B03_context_free" : "B02_textbook_generic",
      quote: answer.slice(0, 80),
      severity: 1,
    });
  }
  if (
    item.question_type === "resume_verification" &&
    !/\b(wrong|late|slipped|failed|broke|missed|redo|mistake)\b/.test(text)
  )
    triggers.push("no_failure");
  if (item.question_type === "case" && !/\b(first|start|look at|check|split|compare)\b/.test(text))
    triggers.push("adjacent");

  if (
    /\b(not my part|my part was|i overstated|honestly|actually only|i don't recall|i would check|i'd check|i'm not sure but)\b/.test(
      text,
    )
  ) {
    candid.push({
      signal: "honest_down_scope",
      quote:
        answer.match(/(not my part|my part was|i overstated|honestly)[^.]{0,60}/i)?.[0] ??
        answer.slice(0, 60),
    });
  }
  if (/\b(controller|manager|accountant|analyst|engineer|lead)\b/.test(text) && firstPerson)
    candid.push({ signal: "named_own_downside", quote: answer.slice(0, 60) });

  let score = 1;
  if (firstPerson && words >= 25) score = 3;
  if (score === 3 && anchored && hasNumber) score = 4;
  if (candid.length && score < 3) score = 3;
  if (item.question_type === "warm_up") score = 0;
  return { triggers, patterns, candid, score };
}

function chooseProbe(
  item: MockPlanItem,
  triggers: Trigger[],
  used: string[],
): MockPlanItem["probes"][number] | null {
  for (const probe of item.probes) {
    if (used.includes(probe.technique)) continue;
    if (probe.triggers.some((trigger) => triggers.includes(trigger))) return probe;
  }
  return null;
}

/* ---------------- public transitions ---------------- */

export function consentGiven(session: MockSession, consent: MockSession["consent"]): void {
  session.consent = consent;
  session.status = "device_check";
  audit(
    "consent",
    `recording=${consent.recording_consent} behavioral=${consent.behavioral_analysis_consent}`,
    session.session_id,
  );
  publish(session);
}

export function deviceReady(session: MockSession, device: MockSession["device"]): void {
  session.device = device;
  if (!device.microphone && !session.accommodations.includes("text_modality"))
    session.accommodations.push("text_modality");
  session.status = "ready";
  publish(session);
}

export function disclosureText(session: MockSession): string {
  const parts: string[] = [SCRIPTS.opening_disclosure];
  if (session.consent.behavioral_analysis_consent) parts.push(SCRIPTS.behavioral_sentence);
  return parts.join(" ");
}

export function start(session: MockSession): void {
  if (session.status !== "ready") return;
  session.started_at = now();
  session.status = "active";
  session.transcript.push({
    turn_index: 0,
    role: "system",
    question_id: null,
    answer_id: null,
    turn_type: null,
    technique: null,
    target_claim_ids: [],
    probe_index: null,
    ladder_rung: null,
    is_callback: false,
    text: disclosureText(session),
    committed_at: now(),
    source: "script",
  });
  askMainQuestion(session, { evaluate: false });
}

function askMainQuestion(session: MockSession, { evaluate }: { evaluate: boolean }): void {
  const item = currentItem(session);
  if (!item) {
    openCandidateQuestions(session, evaluate);
    return;
  }
  session.probes_used = 0;
  session.probe_budget = 2;
  session.anchors_asked = false;
  session.revealed_facts = [];
  if (item.anchors) {
    session.anchors_asked = true;
    pushInterviewer(session, item.anchors, { turn_type: "follow_up", technique: "ANCHOR" });
    setTurn(session, dto(session, item.anchors, "follow_up", true, "interview"), { evaluate });
    return;
  }
  const text = item.scenario ? `${item.scenario.setup} ${item.question}` : item.question;
  pushInterviewer(session, text, {
    turn_type: "main_question",
    technique: "NONE",
    source: "cache",
  });
  setTurn(session, dto(session, text, "main_question", true, "interview"), { evaluate });
}

function openCandidateQuestions(session: MockSession, evaluate: boolean): void {
  pushInterviewer(session, SCRIPTS.candidate_questions_opener, {
    turn_type: "candidate_questions",
    source: "script",
  });
  session.candidate_questions_asked = 0;
  setTurn(
    session,
    dto(session, SCRIPTS.candidate_questions_opener, "candidate_questions", true, "your_questions"),
    { evaluate },
  );
}

function close(session: MockSession, evaluate: boolean): void {
  pushInterviewer(session, SCRIPTS.closing, { turn_type: "closing", source: "script" });
  setTurn(session, dto(session, SCRIPTS.closing, "closing", false, "closing"), { evaluate });
  if (!evaluate) {
    session.status = "closed";
    session.ended_at = now();
    publish(session);
  }
}

export function answer(session: MockSession, text: string): void {
  if (session.status !== "active" && session.status !== "candidate_questions") return;
  const item = currentItem(session);
  // "Would you like me to repeat the question?" after an adjustment: yes → repeat; anything else is an answer.
  const lastInterviewer = [...session.transcript]
    .reverse()
    .find((entry) => entry.role === "interviewer");
  if (
    lastInterviewer?.text.startsWith("Of course.") &&
    /^(yes|yeah|yep|please|ok|okay|sure|repeat)/i.test(text.trim())
  ) {
    pushCandidate(session, text);
    request(session, "repeat");
    return;
  }
  const answerId = pushCandidate(session, text);

  // Your-questions phase: answer from the tiny "company context" and close after two questions.
  if (session.status === "candidate_questions" || !item) {
    session.candidate_questions_asked += 1;
    const lower = text.toLowerCase();
    let reply: string;
    if (/no|nothing|that's all|thanks|thank you|done/.test(lower) && text.length < 60) {
      close(session, true);
      return;
    }
    if (/team|report|who/.test(lower))
      reply = "The role reports to the FP&A manager and works with three plant controllers.";
    else if (/salary|pay|compensation|notice|leave|benefit/.test(lower))
      reply = SCRIPTS.candidate_questions_unknown;
    else if (/record|ai|video|analysis/.test(lower)) reply = SCRIPTS.behavioral_sentence;
    else reply = SCRIPTS.candidate_questions_unknown;
    if (session.candidate_questions_asked >= 2) {
      pushInterviewer(session, reply, { turn_type: "candidate_questions", source: "model" });
      close(session, true);
      return;
    }
    const message = `${reply} ${SCRIPTS.another_question}`;
    pushInterviewer(session, message, { turn_type: "candidate_questions" });
    setTurn(session, dto(session, message, "candidate_questions", true, "your_questions"), {
      evaluate: true,
    });
    return;
  }

  // Anchor answer: now ask the verbatim main question.
  if (
    session.anchors_asked &&
    session.probes_used === 0 &&
    session.transcript.at(-2)?.technique === "ANCHOR"
  ) {
    const questionText = item.scenario ? `${item.scenario.setup} ${item.question}` : item.question;
    pushInterviewer(session, questionText, {
      turn_type: "main_question",
      technique: "NONE",
      source: "cache",
    });
    setTurn(session, dto(session, questionText, "main_question", true, "interview"), {
      evaluate: true,
    });
    return;
  }

  // Case clarification: reveal matching facts verbatim.
  if (
    item.scenario &&
    /\?|what|how|is the|are the|did|does|can you tell/i.test(text) &&
    text.split(/\s+/).length < 30
  ) {
    const hits = item.scenario.facts
      .map((fact, index) => ({ fact, index }))
      .filter(({ fact, index }) => fact.topic.test(text) && !session.revealed_facts.includes(index))
      .slice(0, 2);
    if (hits.length) {
      hits.forEach(({ index }) => session.revealed_facts.push(index));
      const message = `${hits.map(({ fact }) => fact.text).join(" ")} ${SCRIPTS.go_ahead_line}`;
      pushInterviewer(session, message, { turn_type: "follow_up", technique: "REVEAL" });
      setTurn(session, dto(session, message, "follow_up", true, "interview"), { evaluate: true });
      return;
    }
    if (
      item.scenario.facts.some(
        (f) => !session.revealed_facts.includes(item.scenario!.facts.indexOf(f)),
      )
    ) {
      pushInterviewer(session, SCRIPTS.assume_line, {
        turn_type: "follow_up",
        technique: "REVEAL",
        source: "script",
      });
      setTurn(session, dto(session, SCRIPTS.assume_line, "follow_up", true, "interview"), {
        evaluate: true,
      });
      return;
    }
  }

  // Evaluate (mock of Prompt 03) and decide: probe or advance.
  const { triggers, patterns, candid, score } = detect(text, item);
  const usedTechniques = session.transcript
    .filter(
      (entry) =>
        entry.question_id === item.question_id &&
        entry.role === "interviewer" &&
        entry.probe_index !== null,
    )
    .map((entry) => entry.technique ?? "");
  const escalate =
    patterns.filter((p) => p.severity >= 2).length >= 2 && session.probe_budget === 2;
  if (escalate) session.probe_budget = 3;
  const probe =
    item.question_type === "warm_up" ? null : chooseProbe(item, triggers, usedTechniques);
  const canProbe =
    probe !== null && session.probes_used < session.probe_budget && candid.length === 0;

  const evaluation: EvaluationSummary = {
    question_id: item.question_id,
    answer_id: answerId,
    competency_scores: item.target_competencies.map((competency_id) => ({
      competency_id,
      score,
      evidence_grade:
        score >= 4
          ? "specific_with_verification_detail"
          : score >= 3
            ? "specific"
            : score >= 1
              ? "generic"
              : "none",
      evidence: [text.slice(0, 100)],
      missing_evidence: triggers.map((trigger) => trigger.replace("_", " ")),
    })),
    pattern_flags: patterns,
    candid_signals: candid,
    probe_directives:
      probe && canProbe
        ? [{ rank: 1, technique: probe.technique, suggested_wording: probe.text }]
        : [],
    recommended_next_action: canProbe ? "probe" : "advance",
    question_digest: `${item.question_id}: ${score >= 3 ? "anchored instance stated" : "generic account"}; ${triggers.length ? `unresolved: ${triggers.join(", ")}` : "unresolved: none"}.`,
    confidence: score === 0 ? "low" : "medium",
    reviewer_flags: [],
  };
  session.evaluations.push(evaluation);
  const patternWeight = patterns.reduce((sum, p) => sum + p.severity, 0);
  const row: BudgetAuditRow = {
    answer_id: answerId,
    pattern_weight: patternWeight,
    distinct_moderate: patterns.filter((p) => p.severity >= 2).length,
    evidence_grade: evaluation.competency_scores[0]?.evidence_grade ?? "none",
    content_escalation: escalate,
    attention_boost: false,
    base: 2,
    cap: 4,
    pool_before: 6 - session.probes_total,
    pool_after: 6 - session.probes_total - (canProbe ? 1 : 0),
    model_recommendation: evaluation.recommended_next_action,
    backend_decision: canProbe ? "probe" : "advance",
    override_reason:
      probe && !canProbe && session.probes_used >= session.probe_budget ? "budget_exhausted" : null,
  };
  session.budget_audit.push(row);
  audit(
    "budget_decision",
    `${answerId}: weight=${patternWeight} decision=${row.backend_decision}`,
    session.session_id,
  );

  if (canProbe && probe) {
    session.probes_used += 1;
    session.probes_total += 1;
    let wording = probe.text;
    if (probe.technique === "OWN" && usedTechniques.includes("OWN"))
      wording = wording.replace("It is fine to say I here. ", "");
    pushInterviewer(session, wording, {
      turn_type: "follow_up",
      technique: probe.technique,
      probe_index: session.probes_used,
      source: "fast_path",
    });
    setTurn(session, dto(session, wording, "follow_up", true, "interview"), { evaluate: true });
    return;
  }

  session.plan_index += 1;
  askMainQuestion(session, { evaluate: true });
}

export function request(
  session: MockSession,
  type: "repeat" | "rephrase" | "break" | "resume" | "stop",
): void {
  const item = currentItem(session);
  switch (type) {
    case "repeat": {
      const text = session.pending_question_text ?? item?.question ?? SCRIPTS.idk_ack;
      pushInterviewer(session, text, { turn_type: "follow_up", source: "cache" });
      setTurn(
        session,
        dto(
          session,
          text,
          "follow_up",
          true,
          session.status === "candidate_questions" ? "your_questions" : "interview",
        ),
        { evaluate: false },
      );
      return;
    }
    case "rephrase": {
      const text = item?.rephrase ?? session.pending_question_text ?? SCRIPTS.idk_ack;
      pushInterviewer(session, text, {
        turn_type: "follow_up",
        technique: "REFRAME",
        source: "model",
      });
      setTurn(session, dto(session, text, "follow_up", true, "interview"), { evaluate: false });
      return;
    }
    case "break": {
      const text = `${SCRIPTS.take_your_time} ${SCRIPTS.break_resume_line}`;
      pushInterviewer(session, text, { turn_type: "follow_up", source: "script" });
      session.status = "paused";
      session.current_turn = dto(session, text, "follow_up", true, "interview");
      publish(session);
      return;
    }
    case "resume": {
      if (session.status !== "paused") return;
      session.status = "active";
      const text = session.pending_question_text ?? item?.question ?? SCRIPTS.idk_ack;
      pushInterviewer(session, text, { turn_type: "follow_up", source: "cache" });
      setTurn(session, dto(session, text, "follow_up", true, "interview"), { evaluate: false });
      return;
    }
    case "stop": {
      pushInterviewer(session, SCRIPTS.escalate_closing, {
        turn_type: "closing",
        source: "script",
      });
      session.status = "escalated";
      session.escalation_reason = "candidate_requested_stop";
      session.ended_at = now();
      session.current_turn = dto(session, SCRIPTS.escalate_closing, "closing", false, "closing");
      audit("escalation", "candidate_requested_stop", session.session_id);
      publish(session);
      return;
    }
    default:
      return;
  }
}

export function adjustment(session: MockSession, code: AccommodationCode): void {
  if (!session.accommodations.includes(code)) session.accommodations.push(code);
  audit("accommodation", code, session.session_id);
  if (code === "human_interviewer") {
    pushInterviewer(session, SCRIPTS.escalate_closing, { turn_type: "closing", source: "script" });
    session.status = "escalated";
    session.escalation_reason = "accommodation_unavailable";
    session.ended_at = now();
    session.current_turn = dto(session, SCRIPTS.escalate_closing, "closing", false, "closing");
    publish(session);
    return;
  }
  if (
    session.status === "awaiting_consent" ||
    session.status === "device_check" ||
    session.status === "ready"
  ) {
    publish(session);
    return;
  }
  const line = SCRIPTS.accommodation_line.replace(
    "[CHANGE]",
    ACCOMMODATION_EFFECT[code] ?? "The change has been applied.",
  );
  pushInterviewer(session, line, { turn_type: "follow_up", source: "script" });
  setTurn(
    session,
    dto(
      session,
      line,
      "follow_up",
      true,
      session.status === "candidate_questions" ? "your_questions" : "interview",
    ),
    { evaluate: false },
  );
}
