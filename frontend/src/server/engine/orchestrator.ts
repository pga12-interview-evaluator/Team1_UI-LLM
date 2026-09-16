import "server-only";
import type { AccommodationCode, CandidateTurnDto } from "@/lib/api/schemas/candidate";
import type { EvaluationSummary, TranscriptEntry } from "@/lib/api/schemas/console";
import { callGemini, GeminiError } from "../gemini";
import { promptVersions, renderPrompt } from "../prompts";
import { audit, db, save, type RealSession } from "../store";
import { transcribeWav } from "../whisper";
import { stripQuestionEcho } from "./echo";
import {
  captureEnabled,
  disableCapture,
  flagsForNextTurn,
  highFlagFired,
  ingestAnswerSignals,
  recordFlagUse,
  releaseCapture,
} from "./behavioralFlow";
import {
  ACCOMMODATION_EFFECT_EN,
  policySnapshot,
  scriptsFor,
  violatesGuard,
  type PressureLevel,
} from "./policy";
import {
  applyBudgetRules,
  buildAssessmentInput,
  buildSessionState,
  currentItem,
  duration,
  emptyCaseState,
  nextItem,
  planItems,
  timePressureMode,
} from "./state";

type Dict = Record<string, unknown>;

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ creation */

export interface CreateInput {
  candidate_name: string;
  job_title: string;
  job_description: string;
  duration_minutes: number;
  interview_style: string;
  seniority: string;
  interview_language: string;
  resume_text: string;
  interview_purpose?: "hiring" | "mock_practice";
  pressure_level?: PressureLevel;
  company_context?: string | null;
}

export function createSession(input: CreateInput): RealSession {
  const pressure: PressureLevel =
    input.pressure_level ?? (input.interview_purpose === "hiring" ? "standard" : "calm");
  const id = `S_${Math.random().toString(36).slice(2, 10)}`;
  const token = `inv_${Math.random().toString(36).slice(2, 14)}`;
  const policy = policySnapshot(pressure);
  const session: RealSession = {
    session_id: id,
    invite_token: token,
    created_at: now(),
    started_at: null,
    ended_at: null,
    status: "awaiting_consent",
    escalation_reason: null,
    candidate_label: input.candidate_name,
    interview_input: {
      schema_version: "interview_input/2.0",
      requisition_id: `REQ_${id}`,
      session_id: id,
      mode: null,
      effective_duration_minutes: input.duration_minutes,
      job_title: input.job_title,
      field: input.job_title,
      field_family: null,
      seniority: input.seniority,
      employment_type: null,
      location_or_market: null,
      interview_language: input.interview_language,
      duration_minutes: input.duration_minutes,
      interview_style: input.interview_style,
      interview_modality: "both",
      interview_purpose: input.interview_purpose ?? "mock_practice",
      pressure_level: pressure,
      pressure_rationale: null,
      job_description:
        input.job_description ||
        `Role: ${input.job_title} (${input.seniority}). No job description was supplied; infer role outcomes from the title and the resume, and record the inference under missing_information.`,
      must_have_skills: [],
      nice_to_have_skills: [],
      candidate_resume: input.resume_text,
      resume_redaction_applied: true,
      candidate_portfolio_or_context: null,
      company_context: input.company_context ?? null,
      interviewer_constraints: "No coding or spreadsheet task; voice or typed answers only.",
      accommodation_notes: {
        codes: [],
        operational_note: null,
        behavioral_analysis_consent: false,
        timing_triggers_disabled: false,
      },
      consent: {
        ai_interview_notice_ack: false,
        recording_consent: false,
        notice_version: "2026-03",
      },
    },
    policy_snapshot: policy,
    resume_text: input.resume_text,
    blueprint: null,
    blueprint_error: null,
    consent: {
      ai_interview_notice_ack: false,
      recording_consent: false,
      behavioral_analysis_consent: false,
      notice_version: "2026-03",
    },
    device: { camera: false, microphone: false },
    accommodations: [],
    current_question_id: null,
    completed_question_ids: [],
    skipped_question_ids: [],
    probe_index: 0,
    probe_budget_remaining: policy.probe_budget_base,
    probe_budget_reason: `base ${policy.probe_budget_base}`,
    probe_pool_remaining: 0,
    probes_total: 0,
    evaluator_directives: [],
    premises_remaining: policy.premises_max,
    callbacks_remaining: policy.callbacks_max,
    reconciliations_remaining: policy.reconciliations_max,
    mutations_used: [],
    reframe_used: false,
    case_state: null,
    ledger: [],
    digests: [],
    phase: "opening",
    candidate_questions_asked: 0,
    pending_question_text: null,
    turn_index: 0,
    current_turn: null,
    evaluating: false,
    transcript: [],
    evaluations_raw: [],
    evaluations: [],
    budget_audit: [],
    answer_ids: {},
    media_refs: {},
    report_raw: null,
    human_decision: null,
    gemini_log: [],
  };
  db().sessions.set(id, session);
  db().tokens.set(token, id);
  save(session);
  audit(
    "consent",
    `session created (${input.interview_language}, ${input.duration_minutes} min, ${pressure})`,
    id,
  );
  // Kick off the blueprint immediately; consent + device check give it time to finish.
  db().pending.set(
    id,
    generateBlueprint(session).catch(() => undefined),
  );
  return session;
}

function log(
  session: RealSession,
  stage: string,
  result: { latency_ms: number; usage: { prompt: number; output: number } } | null,
  error?: unknown,
) {
  session.gemini_log.push({
    stage,
    at: now(),
    latency_ms: result?.latency_ms ?? 0,
    prompt_tokens: result?.usage.prompt ?? 0,
    output_tokens: result?.usage.output ?? 0,
    ok: !error,
    error: error ? String(error) : undefined,
  });
}

/* ------------------------------------------------------------------ 01 blueprint */

export async function generateBlueprint(session: RealSession): Promise<void> {
  if (session.blueprint) return;
  const prompt = renderPrompt("01", {
    interview_input_json: session.interview_input,
    policy_snapshot_json: session.policy_snapshot,
    requisition_blueprint_json: null,
  });
  try {
    const result = await callGemini<Dict>("01", prompt);
    const blueprint = result.data;
    const weights = ((blueprint.competencies as Dict[] | undefined) ?? []).reduce(
      (sum, c) => sum + Number(c.weight ?? 0),
      0,
    );
    const plan = (blueprint.interview_plan as Dict[] | undefined) ?? [];
    if (!plan.length) throw new GeminiError(422, "Blueprint has no interview_plan.");
    if (Math.abs(weights - 100) > 2) {
      // Normalize rather than reject: keep the interview usable, note it for the reviewer.
      const total = weights || 1;
      for (const c of (blueprint.competencies as Dict[]) ?? [])
        c.weight = Math.round((Number(c.weight ?? 0) / total) * 100);
    }
    session.blueprint = blueprint;
    session.blueprint_error = null;
    const mains =
      plan.filter((item) => item.question_type !== "ladder" && item.question_type !== "warm_up")
        .length || 1;
    session.probe_pool_remaining = Math.ceil(
      mains * Number((session.policy_snapshot as Dict).interview_probe_pool_factor ?? 1.5),
    );
    log(session, "01", result);
  } catch (caught) {
    session.blueprint_error = caught instanceof Error ? caught.message : String(caught);
    log(session, "01", null, caught);
    audit("schema_repair", `blueprint failed: ${session.blueprint_error}`, session.session_id);
  } finally {
    save(session);
  }
}

export async function ensureBlueprint(session: RealSession): Promise<void> {
  if (session.blueprint) return;
  const pending = db().pending.get(session.session_id);
  if (pending) {
    await pending;
    db().pending.delete(session.session_id);
  }
  if (!session.blueprint) {
    session.blueprint_error = null;
    await generateBlueprint(session);
  }
  if (!session.blueprint)
    throw new GeminiError(502, session.blueprint_error ?? "Blueprint generation failed.");
}

/* ------------------------------------------------------------------ transcript helpers */

function pushEntry(
  session: RealSession,
  entry: Omit<TranscriptEntry, "turn_index" | "committed_at" | "segments">,
): TranscriptEntry {
  session.turn_index += 1;
  const full: TranscriptEntry = {
    ...entry,
    turn_index: session.turn_index,
    committed_at: now(),
  } as TranscriptEntry;
  session.transcript.push(full);
  return full;
}

function dtoFor(
  session: RealSession,
  message: string,
  turnType: CandidateTurnDto["turn_type"],
  requiresAnswer: boolean,
): CandidateTurnDto {
  const item = currentItem(session);
  const unlimited = session.accommodations.includes("extended_answer_time");
  const phase =
    session.phase === "candidate_questions"
      ? "your_questions"
      : session.phase === "closing"
        ? "closing"
        : "interview";
  return {
    turn_index: session.turn_index,
    turn_type: turnType,
    candidate_message: message,
    requires_answer: requiresAnswer,
    max_answer_seconds: unlimited ? 3600 : item?.question_type === "case" ? 240 : 180,
    can_request_clarification: !!item?.scenario,
    phase_label: phase,
  };
}

function setTurn(
  session: RealSession,
  message: string,
  turnType: CandidateTurnDto["turn_type"],
  requiresAnswer: boolean,
  meta: {
    technique?: string;
    source?: TranscriptEntry["source"];
    turn_type?: string;
    probe_index?: number | null;
    question_id?: string | null;
  },
) {
  pushEntry(session, {
    role: "interviewer",
    question_id: meta.question_id ?? session.current_question_id,
    answer_id: null,
    turn_type: meta.turn_type ?? turnType,
    technique: meta.technique ?? "NONE",
    target_claim_ids: [],
    probe_index: meta.probe_index ?? null,
    ladder_rung: null,
    is_callback: false,
    text: message,
    source: meta.source ?? "model",
  });
  session.current_turn = dtoFor(session, message, turnType, requiresAnswer);
  if (requiresAnswer) session.pending_question_text = message;
  session.evaluating = false;
}

/* ------------------------------------------------------------------ consent / device / start */

export function consentGiven(session: RealSession, consent: RealSession["consent"]) {
  session.consent = consent;
  (session.interview_input.accommodation_notes as Dict).behavioral_analysis_consent =
    consent.behavioral_analysis_consent;
  (session.interview_input.consent as Dict) = {
    ai_interview_notice_ack: true,
    recording_consent: consent.recording_consent,
    notice_version: consent.notice_version,
  };
  session.status = "device_check";
  save(session);
  audit(
    "consent",
    `recording=${consent.recording_consent} behavioral=${consent.behavioral_analysis_consent}`,
    session.session_id,
  );
}

export function deviceReady(session: RealSession, device: RealSession["device"]) {
  session.device = device;
  if (!device.microphone && !session.accommodations.includes("text_modality"))
    session.accommodations.push("text_modality");
  session.status = "ready";
  save(session);
}

export function disclosureText(session: RealSession): string {
  const scripts = scriptsFor(String(session.interview_input.interview_language));
  const parts = [scripts.opening_disclosure];
  if (session.consent.behavioral_analysis_consent)
    parts.push(
      "Audio/video signals are used only to decide which follow-up question to ask next; they are never part of your score.",
    );
  if (session.policy_snapshot.pressure_level === "calm")
    parts.push(
      "There is no single expected answer to any question; answer from what you actually did or would do.",
    );
  return parts.join(" ");
}

export async function start(session: RealSession): Promise<void> {
  if (session.status !== "ready") return;
  await ensureBlueprint(session);
  session.started_at = now();
  session.status = "active";
  session.phase = "main";
  pushEntry(session, {
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
    source: "script",
  });
  await interviewerTurn(session, null);
  save(session);
}

/* ------------------------------------------------------------------ 02 interviewer turn */

interface TurnOutput {
  candidate_message: string;
  turn_type: string;
  question_id: string | null;
  requires_answer: boolean;
  technique: string;
  recommended_state_update?: Dict;
  hidden_turn_note?: Dict;
  escalate_to_human?: { flag?: boolean; reason?: string | null };
  candidate_request?: string;
  fact_ids_revealed?: string[];
}

const DTO_TYPE: Record<string, CandidateTurnDto["turn_type"]> = {
  main_question: "main_question",
  follow_up: "follow_up",
  callback: "follow_up",
  constraint_mutation: "follow_up",
  ladder_step: "follow_up",
  reframe: "follow_up",
  reconciliation: "follow_up",
  clarification_reveal: "follow_up",
  candidate_questions: "candidate_questions",
  closing: "closing",
};

/** Ask the next verbatim main question without a model call (fallback / after budget exhaustion). */
function mechanicalAdvance(session: RealSession): void {
  if (
    session.current_question_id &&
    !session.completed_question_ids.includes(session.current_question_id)
  ) {
    session.completed_question_ids.push(session.current_question_id);
  }
  const item = nextItem(session);
  const scripts = scriptsFor(String(session.interview_input.interview_language));
  if (!item || timePressureMode(session) === "reserve") {
    if (session.phase !== "candidate_questions") {
      session.phase = "candidate_questions";
      session.status = "candidate_questions";
      session.current_question_id = null;
      setTurn(session, scripts.candidate_questions_opener, "candidate_questions", true, {
        source: "script",
        question_id: null,
      });
      return;
    }
    closeInterview(session);
    return;
  }
  session.current_question_id = String(item.question_id);
  session.probe_index = 0;
  session.probe_budget_remaining = Number((session.policy_snapshot as Dict).probe_budget_base ?? 2);
  session.probe_budget_reason = `base ${session.probe_budget_remaining}`;
  session.evaluator_directives = [];
  session.mutations_used = [];
  session.reframe_used = false;
  session.case_state = item.scenario ? emptyCaseState() : null;
  const scenario = item.scenario as Dict | null;
  const text = scenario
    ? `${String(scenario.setup_text ?? "")} ${String(item.candidate_facing_question)}`.trim()
    : String(item.candidate_facing_question);
  setTurn(session, text, "main_question", true, { source: "cache", turn_type: "main_question" });
}

function closeInterview(session: RealSession): void {
  const scripts = scriptsFor(String(session.interview_input.interview_language));
  releaseCapture(session);
  session.phase = "closing";
  session.status = "closed";
  session.ended_at = now();
  session.current_question_id = null;
  setTurn(session, scripts.closing, "closing", false, { source: "script", question_id: null });
}

async function interviewerTurn(session: RealSession, latestAnswer: string | null): Promise<void> {
  const state = buildSessionState(
    session,
    latestAnswer,
    session.ledger.filter(
      (row) => !["supported", "revised_by_candidate"].includes(String(row.verification_status)),
    ),
    flagsForNextTurn(session),
  );
  const prompt = renderPrompt("02", { session_state_json: state });
  let output: TurnOutput;
  let result: Awaited<ReturnType<typeof callGemini<TurnOutput>>>;
  try {
    result = await callGemini<TurnOutput>("02", prompt);
    output = result.data;
    log(session, "02", result);
  } catch (caught) {
    log(session, "02", null, caught);
    audit(
      "schema_repair",
      `02 failed, mechanical advance: ${String(caught).slice(0, 160)}`,
      session.session_id,
    );
    mechanicalAdvance(session);
    return;
  }
  const violation = violatesGuard(output.candidate_message ?? "");
  const update = output.recommended_state_update ?? {};
  recordFlagUse(session, update.attention_flag_use);
  // Apply permitted state updates (each checked against a hard rule).
  if (
    update.mark_question_complete === true &&
    session.current_question_id &&
    !session.completed_question_ids.includes(session.current_question_id)
  ) {
    session.completed_question_ids.push(session.current_question_id);
  }
  if (
    update.mark_question_skipped_by_candidate === true &&
    session.current_question_id &&
    !session.skipped_question_ids.includes(session.current_question_id)
  ) {
    session.skipped_question_ids.push(session.current_question_id);
  }
  if (typeof update.set_current_question_id === "string" && update.set_current_question_id) {
    const exists = planItems(session).some(
      (item) => item.question_id === update.set_current_question_id,
    );
    if (exists) {
      session.current_question_id = update.set_current_question_id;
      session.probe_index = 0;
      session.probe_budget_remaining = Number(
        (session.policy_snapshot as Dict).probe_budget_base ?? 2,
      );
      session.probe_budget_reason = `base ${session.probe_budget_remaining}`;
      session.evaluator_directives = [];
      session.mutations_used = [];
      session.reframe_used = false;
      session.case_state = currentItem(session)?.scenario ? emptyCaseState() : null;
    } else {
      audit(
        "state_update_rejected",
        `unknown question id ${String(update.set_current_question_id)}`,
        session.session_id,
      );
    }
  }
  if (update.increment_probe_count === true) {
    if (session.probe_budget_remaining > 0 && session.probe_pool_remaining > 0) {
      session.probe_index += 1;
      session.probe_budget_remaining -= 1;
      session.probe_pool_remaining -= 1;
      session.probes_total += 1;
    } else {
      audit("state_update_rejected", "increment_probe_count with no budget", session.session_id);
    }
  }
  if (Array.isArray(update.fact_ids_revealed) && session.case_state) {
    const revealed = session.case_state.revealed_fact_ids as string[];
    for (const id of update.fact_ids_revealed as string[])
      if (!revealed.includes(id)) revealed.push(id);
    session.case_state.clarifications_asked_count =
      Number(session.case_state.clarifications_asked_count ?? 0) + 1;
  }
  if (typeof update.mutation_id_used === "string" && update.mutation_id_used)
    session.mutations_used.push(update.mutation_id_used);
  if (update.mark_reframe_used === true) session.reframe_used = true;
  if (update.accommodation_code_applied && typeof update.accommodation_code_applied === "string") {
    const code = update.accommodation_code_applied as AccommodationCode;
    if (!session.accommodations.includes(code)) session.accommodations.push(code);
    disableCapture(session, code);
  }

  const type = DTO_TYPE[output.turn_type] ?? "follow_up";
  if (output.escalate_to_human?.flag) {
    session.status = "escalated";
    session.escalation_reason = output.escalate_to_human.reason ?? "candidate_requested_stop";
    session.ended_at = now();
    session.phase = "closing";
    setTurn(session, output.candidate_message, "closing", false, {
      source: "model",
      turn_type: output.turn_type,
      question_id: null,
    });
    audit("escalation", session.escalation_reason, session.session_id);
    return;
  }
  if (update.should_end_interview === true || type === "closing") {
    closeInterview(session);
    return;
  }
  if (update.should_start_candidate_questions === true || type === "candidate_questions") {
    session.phase = "candidate_questions";
    session.status = "candidate_questions";
    session.current_question_id = null;
  } else if (output.candidate_request === "break") {
    session.status = "paused";
  } else {
    session.status = "active";
  }
  if (violation) {
    audit(
      "guard_violation",
      `02 candidate_message contained "${violation}"; substituted`,
      session.session_id,
    );
    // Fallback: verbatim main question or a fixed line, never the offending text.
    const item = currentItem(session);
    const fallback = item
      ? String(item.candidate_facing_question)
      : scriptsFor(String(session.interview_input.interview_language)).idk_ack;
    setTurn(session, fallback, type, output.requires_answer !== false, {
      source: "fallback",
      turn_type: output.turn_type,
      technique: output.technique,
    });
    return;
  }
  const probeIndex = update.increment_probe_count === true ? session.probe_index : null;
  setTurn(session, output.candidate_message, type, output.requires_answer !== false, {
    source: "model",
    turn_type: output.turn_type,
    technique: output.technique,
    probe_index: probeIndex,
  });
}

/* ------------------------------------------------------------------ answer → 03 → next turn */

export async function transcribeMedia(session: RealSession, mediaRef: string): Promise<string> {
  const stored = session.media_refs[mediaRef];
  if (stored?.transcript) return stored.transcript;
  const wav = db().audio.get(mediaRef);
  if (!wav)
    throw new Error(
      "Audio for this answer was not received. Please record again or type your answer.",
    );
  const roleSummary = (session.blueprint?.role_summary as Dict | undefined) ?? {};
  const hint = [
    session.candidate_label,
    String(session.interview_input.job_title ?? ""),
    ...((roleSummary.jd_key_phrases as string[] | undefined) ?? []).slice(0, 8),
  ].join(", ");
  const result = await transcribeWav(wav, {
    language: String(session.interview_input.interview_language ?? ""),
    hint,
  });
  session.media_refs[mediaRef] = {
    turn_index: stored?.turn_index ?? session.turn_index,
    transcript: result.text,
    duration_sec: Number.isFinite(result.duration_sec) ? result.duration_sec : null,
    speech: result.speech ?? null,
    segments: (result.segments ?? []).map((s) => ({
      start: Number(s.start.toFixed(2)),
      end: Number(s.end.toFixed(2)),
      words: s.text.split(/\s+/).filter(Boolean).length,
    })),
  };
  db().audio.delete(mediaRef);
  return result.text;
}

export async function answer(
  session: RealSession,
  payload: { text: string; media_ref: string | null; auto_submitted: boolean; turn_index: number },
): Promise<void> {
  if (!["active", "candidate_questions"].includes(session.status)) return;
  let text = payload.text.trim();
  if (payload.media_ref) {
    try {
      let transcript = await transcribeMedia(session, payload.media_ref);
      // The mic often hears the question being read aloud before the answer starts.
      const asked = session.current_turn?.candidate_message ?? session.pending_question_text ?? "";
      if (asked) {
        const cleaned = stripQuestionEcho(transcript, asked);
        if (cleaned.removed_words > 0) {
          transcript = cleaned.text;
          audit(
            "schema_repair",
            `question echo removed from voice answer (${cleaned.removed_words} words)`,
            session.session_id,
          );
        }
      }
      text = [transcript, text].filter(Boolean).join(" ").trim();
    } catch (caught) {
      audit(
        "schema_repair",
        `transcription failed: ${String(caught).slice(0, 160)}`,
        session.session_id,
      );
      if (!text) throw caught;
    }
  }
  const askedEntry = [...session.transcript]
    .reverse()
    .find((entry) => entry.role === "interviewer");
  const answerId = session.current_question_id
    ? `A_${session.current_question_id}_${session.probe_index}`
    : `A_misc_${session.turn_index}`;
  pushEntry(session, {
    role: "candidate",
    question_id: session.current_question_id,
    answer_id: answerId,
    turn_type: null,
    technique: null,
    target_claim_ids: [],
    probe_index: session.probe_index,
    ladder_rung: null,
    is_callback: false,
    text: text || "[no answer]",
    source: "candidate",
  });
  session.evaluating = true;
  session.current_turn = null;
  save(session);
  // Body-language window closes with the answer. Non-scored: result only feeds 02's attention_flags.
  if (captureEnabled(session) && session.current_question_id)
    await ingestAnswerSignals(session, {
      answer_id: answerId,
      question_id: session.current_question_id,
      turn_index: payload.turn_index,
      speech: payload.media_ref ? (session.media_refs[payload.media_ref]?.speech ?? null) : null,
    });

  try {
    if (session.status === "candidate_questions" || !session.current_question_id) {
      // Their questions phase: 02 answers from company_context and decides when to close.
      session.candidate_questions_asked += 1;
      if (
        session.candidate_questions_asked >= 3 ||
        /^(no|nothing|that'?s all|thanks?|thank you|done|nope)\b/i.test(text)
      ) {
        closeInterview(session);
      } else {
        await interviewerTurn(session, text);
      }
      return;
    }

    // Empty / inaudible answer: repeat once, then treat as skip (02 S0.c2, handled mechanically).
    if (!text) {
      const lastTwo = session.transcript.slice(-3).filter((entry) => entry.role === "interviewer");
      if (lastTwo.length >= 2 && lastTwo[0].text === lastTwo[1].text) {
        mechanicalAdvance(session);
      } else if (session.pending_question_text) {
        setTurn(session, session.pending_question_text, "follow_up", true, { source: "cache" });
      }
      return;
    }

    // 03 evaluator
    const directiveExecuted =
      askedEntry?.source === "fast_path"
        ? ((session.evaluator_directives[0] as Dict | undefined) ?? null)
        : null;
    const assessmentInput = buildAssessmentInput(
      session,
      { text, answer_id: answerId },
      {
        text: askedEntry?.text ?? "",
        turn_type: askedEntry?.turn_type ?? "main_question",
        technique: askedEntry?.technique ?? "NONE",
        source:
          askedEntry?.source === "fast_path"
            ? "fast_path_directive"
            : askedEntry?.source === "model"
              ? "interviewer_composed"
              : "blueprint_verbatim",
        directive: directiveExecuted,
      },
      session.ledger,
    );
    let evaluation: Dict | null = null;
    try {
      const result = await callGemini<Dict>(
        "03",
        renderPrompt("03", { assessment_input_json: assessmentInput }),
      );
      evaluation = result.data;
      log(session, "03", result);
    } catch (caught) {
      log(session, "03", null, caught);
      audit(
        "schema_repair",
        `03 failed, advancing: ${String(caught).slice(0, 160)}`,
        session.session_id,
      );
    }

    if (evaluation) {
      session.evaluations_raw = session.evaluations_raw
        .filter((e) => e.question_id !== session.current_question_id)
        .concat([{ ...evaluation, question_id: session.current_question_id, answer_id: answerId }]);
      mergeLedger(session, evaluation);
      const digest = String(evaluation.question_digest ?? "");
      if (digest) {
        session.digests = session.digests.filter(
          (d) => d.question_id !== session.current_question_id,
        );
        const grades = (
          (evaluation.competency_scores as { evidence_grade?: string }[] | undefined) ?? []
        ).map((c) => c.evidence_grade ?? "none");
        session.digests.push({
          question_id: session.current_question_id,
          digest,
          evidence_grade: grades[0] ?? "none",
          unresolved_claim_ids: [],
        });
      }
      const row = applyBudgetRules(session, evaluation, answerId, highFlagFired(session));
      session.budget_audit.push(row);
      audit(
        "budget_decision",
        `${answerId}: weight=${row.pattern_weight} grade=${row.evidence_grade} → ${row.backend_decision}`,
        session.session_id,
      );
      session.evaluations.push(
        projectEvaluation(evaluation, session.current_question_id, answerId),
      );
      const directives = Array.isArray(evaluation.probe_directives)
        ? (evaluation.probe_directives as Dict[])
        : [];
      session.evaluator_directives = session.probe_budget_remaining > 0 ? directives : [];
      const action = String(evaluation.recommended_next_action ?? "advance");

      // Fast path (00 §11 / H16): commit rank-1 directive directly when it needs no state.
      const rank1 = directives[0];
      if (
        action === "probe" &&
        rank1 &&
        session.probe_budget_remaining > 0 &&
        session.probe_pool_remaining > 0 &&
        rank1.requires_state !== true
      ) {
        const wording = String(rank1.suggested_wording ?? "");
        if (wording && !violatesGuard(wording) && (wording.match(/\?/g) ?? []).length === 1) {
          session.probe_index += 1;
          session.probe_budget_remaining -= 1;
          session.probe_pool_remaining -= 1;
          session.probes_total += 1;
          setTurn(session, wording, "follow_up", true, {
            source: "fast_path",
            technique: String(rank1.technique ?? "DRILL"),
            probe_index: session.probe_index,
          });
          return;
        }
      }
      if (
        ["advance", "close_topic_budget_exhausted", "close_topic_time"].includes(action) ||
        session.probe_budget_remaining === 0
      ) {
        session.evaluator_directives = [];
        await interviewerTurn(session, text);
        return;
      }
    }
    await interviewerTurn(session, text);
  } finally {
    session.evaluating = false;
    save(session);
  }
}

function mergeLedger(session: RealSession, evaluation: Dict): void {
  const extracted = (evaluation.claims_extracted as Dict[] | undefined) ?? [];
  for (const claim of extracted) {
    const id = `CL${session.ledger.length + 1}`;
    session.ledger.push({
      claim_id: id,
      question_id: session.current_question_id,
      verbatim_quote: claim.verbatim_quote ?? "",
      normalized_statement: claim.normalized_statement ?? claim.verbatim_quote ?? "",
      claim_type: claim.claim_type ?? "outcome",
      entity: claim.entity ?? "",
      attribute: claim.attribute ?? null,
      value: claim.value ?? null,
      materiality: claim.materiality ?? "medium",
      ownership_asserted: claim.ownership_asserted ?? "we_unspecified",
      ownership_demonstrated: claim.ownership_demonstrated ?? "not_probed",
      verification_status: "probed",
      last_updated_turn: session.turn_index,
    });
  }
  const updates = (evaluation.ledger_updates as Dict[] | undefined) ?? [];
  for (const update of updates) {
    const row = session.ledger.find((r) => r.claim_id === update.claim_id);
    if (row && update.new_verification_status)
      row.verification_status = update.new_verification_status;
    if (row && update.new_ownership_demonstrated)
      row.ownership_demonstrated = update.new_ownership_demonstrated;
  }
}

function projectEvaluation(
  evaluation: Dict,
  questionId: string | null,
  answerId: string,
): EvaluationSummary {
  const scores = ((evaluation.competency_scores as Dict[] | undefined) ?? []).map((c) => ({
    competency_id: String(c.competency_id ?? "?"),
    score: Math.max(0, Math.min(5, Math.round(Number(c.score ?? 0)))),
    evidence_grade: (["none", "generic", "specific", "specific_with_verification_detail"].includes(
      String(c.evidence_grade),
    )
      ? String(c.evidence_grade)
      : "none") as EvaluationSummary["competency_scores"][number]["evidence_grade"],
    evidence: ((c.evidence as unknown[] | undefined) ?? []).map(String).slice(0, 4),
    missing_evidence: ((c.missing_evidence as unknown[] | undefined) ?? []).map(String).slice(0, 4),
  }));
  return {
    question_id: questionId ?? "?",
    answer_id: answerId,
    competency_scores: scores,
    pattern_flags: ((evaluation.pattern_flags as Dict[] | undefined) ?? []).map((f) => ({
      pattern: String(f.pattern ?? ""),
      quote: String(f.quote ?? ""),
      severity: Math.max(1, Math.min(3, Number(f.severity ?? 1))),
    })),
    candid_signals: ((evaluation.candid_signals as Dict[] | undefined) ?? []).map((s) => ({
      signal: String(s.signal ?? ""),
      quote: String(s.quote ?? ""),
    })),
    probe_directives: ((evaluation.probe_directives as Dict[] | undefined) ?? []).map((d) => ({
      rank: Number(d.rank ?? 1),
      technique: String(d.technique ?? ""),
      suggested_wording: String(d.suggested_wording ?? ""),
    })),
    recommended_next_action: String(evaluation.recommended_next_action ?? "advance"),
    question_digest: String(evaluation.question_digest ?? ""),
    confidence: (["low", "medium", "high"].includes(String(evaluation.confidence))
      ? String(evaluation.confidence)
      : "medium") as "low" | "medium" | "high",
    reviewer_flags: ((evaluation.reviewer_flags as unknown[] | undefined) ?? []).map(String),
  };
}

/* ------------------------------------------------------------------ candidate requests */

export async function request(
  session: RealSession,
  type: "repeat" | "rephrase" | "break" | "resume" | "stop",
): Promise<void> {
  const scripts = scriptsFor(String(session.interview_input.interview_language));
  switch (type) {
    case "repeat": {
      const text = session.pending_question_text ?? scripts.idk_ack;
      setTurn(session, text, "follow_up", true, { source: "cache" });
      break;
    }
    case "rephrase": {
      // Only 02 may re-word; ask it with the request as the latest answer (S0.c).
      if (session.blueprint)
        await interviewerTurn(session, "Could you please rephrase the question?");
      else
        setTurn(session, session.pending_question_text ?? scripts.idk_ack, "follow_up", true, {
          source: "cache",
        });
      break;
    }
    case "break": {
      session.status = "paused";
      setTurn(
        session,
        `${scripts.take_your_time} ${scripts.break_resume_line}`,
        "follow_up",
        true,
        { source: "script" },
      );
      break;
    }
    case "resume": {
      if (session.status !== "paused") return;
      session.status = session.phase === "candidate_questions" ? "candidate_questions" : "active";
      setTurn(session, session.pending_question_text ?? scripts.idk_ack, "follow_up", true, {
        source: "cache",
      });
      break;
    }
    case "stop": {
      session.status = "escalated";
      session.escalation_reason = "candidate_requested_stop";
      session.ended_at = now();
      session.phase = "closing";
      setTurn(session, scripts.escalate_closing, "closing", false, {
        source: "script",
        question_id: null,
      });
      audit("escalation", "candidate_requested_stop", session.session_id);
      break;
    }
  }
  save(session);
}

export function adjustment(session: RealSession, code: AccommodationCode): void {
  const scripts = scriptsFor(String(session.interview_input.interview_language));
  if (!session.accommodations.includes(code)) session.accommodations.push(code);
  (session.interview_input.accommodation_notes as Dict).codes = [...session.accommodations];
  (session.interview_input.accommodation_notes as Dict).timing_triggers_disabled = true;
  audit("accommodation", code, session.session_id);
  disableCapture(session, code);
  if (code === "human_interviewer") {
    session.status = "escalated";
    session.escalation_reason = "accommodation_unavailable";
    session.ended_at = now();
    session.phase = "closing";
    setTurn(session, scripts.escalate_closing, "closing", false, {
      source: "script",
      question_id: null,
    });
  } else if (["active", "paused", "candidate_questions"].includes(session.status)) {
    const line = scripts.accommodation_line.replace(
      "[CHANGE]",
      ACCOMMODATION_EFFECT_EN[code] ?? "The change has been applied.",
    );
    setTurn(session, line, "follow_up", true, { source: "script" });
  }
  save(session);
}

/* ------------------------------------------------------------------ 04 report */

export async function generateReport(session: RealSession): Promise<Dict> {
  if (session.report_raw) return session.report_raw;
  if (!["closed", "escalated"].includes(session.status))
    throw new GeminiError(409, "The report can be generated only after the session is closed.");
  if (!session.blueprint) throw new GeminiError(409, "No blueprint: the interview never started.");
  const input = {
    schema_version: "final_assessment_input/2.0",
    session_id: session.session_id,
    interview_config: {
      job_title: session.interview_input.job_title,
      field: session.interview_input.field,
      field_family:
        (session.blueprint.role_summary as Dict | undefined)?.field_family ?? "general_business",
      seniority: session.interview_input.seniority,
      pressure_level: session.policy_snapshot.pressure_level,
      pressure_rationale: null,
      interview_purpose: session.interview_input.interview_purpose,
      duration_minutes: duration(session),
      interview_modality: "both",
      accommodation_applied: session.accommodations.length > 0,
      interview_language: session.interview_input.interview_language,
    },
    candidate_resume: session.resume_text,
    interview_blueprint: session.blueprint,
    full_transcript: session.transcript.map((t) => ({ ...t, segments: [] })),
    answer_evaluations: session.evaluations_raw,
    claim_ledger_final: session.ledger,
    callback_log: [],
    reconciliation_log: [],
    ladder_state: [],
    probe_audit_content_only: session.budget_audit.map((row) => ({
      question_id: String((row as Dict).answer_id ?? "").split("_")[1] ?? "",
      probes_used: 0,
      content_escalations: (row as Dict).content_escalation ? 1 : 0,
      callbacks_used: 0,
      mutations_used: 0,
      premise_used: false,
      techniques_used: [],
    })),
    coverage: {
      questions_planned: planItems(session).filter((i) => i.question_type !== "ladder").length,
      questions_asked: new Set(session.evaluations.map((e) => e.question_id)).size,
      skipped_by_candidate: session.skipped_question_ids,
      not_reached: planItems(session)
        .filter(
          (i) =>
            !session.completed_question_ids.includes(String(i.question_id)) &&
            i.question_type !== "ladder",
        )
        .map((i) => String(i.question_id)),
      reserve_honored: true,
      end_reason:
        session.status === "escalated"
          ? session.escalation_reason === "candidate_requested_stop"
            ? "candidate_stop"
            : "escalated_to_human"
          : "completed",
    },
  };
  const result = await callGemini<Dict>(
    "04",
    renderPrompt("04", { final_assessment_input_json: input }),
  );
  log(session, "04", result);
  session.report_raw = result.data;
  save(session);
  return result.data;
}

export function versionBundle(): Record<string, string> {
  const versions = promptVersions();
  return {
    prompt_versions: `blueprint ${versions["01"]} · interviewer ${versions["02"]} · evaluator ${versions["03"]} · final ${versions["04"]}`,
    contracts_version: versions.contracts,
    model_id: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    signal_schema_version:
      "behavioral_signals/1.0 · fusion_rules/1.0-gaze-body · producer team3 body language",
    policy_version: "pl-2026-09",
  };
}
