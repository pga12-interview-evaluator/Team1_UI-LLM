import "server-only";
import type { AccommodationCode } from "@/lib/api/schemas/candidate";
import { finalizeTurn, releaseSession } from "../bodyLanguage";
import {
  loadBehavioral,
  purgeBehavioral,
  saveBehavioral,
  type FlagInfluence,
} from "../behavioralStore";
import { audit, type RealSession } from "../store";
import { behavioralToAttention, buildEnvelope, type AttentionFlagItem } from "./behavioral";

/**
 * Session-level glue for 00 §12: when capture is on, when it switches off, what happens to a
 * finished answer, and what (if anything) the next Prompt 02 turn sees. Pure data flow —
 * scoring code never imports this module.
 */

/** §12.2 off switches: no consent, camera off, or ANY accommodation code applied. */
export function captureEnabled(session: RealSession): boolean {
  return (
    session.consent.behavioral_analysis_consent &&
    session.consent.recording_consent &&
    session.device.camera &&
    session.accommodations.length === 0
  );
}

/** Capture stops and the store is purged the moment any accommodation is applied (§12.2, §12.4). */
export function disableCapture(session: RealSession, code: AccommodationCode): void {
  purgeBehavioral(session.session_id);
  void releaseSession(session.session_id);
  audit("accommodation", `behavioral capture stopped and purged (${code})`, session.session_id);
}

export function releaseCapture(session: RealSession): void {
  void releaseSession(session.session_id);
}

/**
 * Close the frame window for the answer that was just submitted, build the envelope, derive
 * flags against the warm-up baseline and stage them for the next 02 turn. Never throws: a dead
 * service or a schema failure just records "no signals" for this answer.
 */
export async function ingestAnswerSignals(
  session: RealSession,
  answer: { answer_id: string; question_id: string; turn_index: number },
): Promise<void> {
  const record = loadBehavioral(session.session_id);
  record.pending = null;
  const result = await finalizeTurn(session.session_id, answer.turn_index);
  if (!result || result.derived.frames_total === 0) {
    record.answers_without_signals.push(answer.answer_id);
    saveBehavioral(record);
    return;
  }
  try {
    const calibration = record.baseline_answer_id === null;
    const baseline = record.baseline_answer_id
      ? (record.answers[record.baseline_answer_id]?.envelope ?? null)
      : null;
    const envelope = buildEnvelope({
      session_id: session.session_id,
      answer_id: answer.answer_id,
      question_id: answer.question_id,
      turn_index: answer.turn_index,
      calibration,
      result,
      baseline,
    });
    const { flags, availability } = behavioralToAttention(envelope, baseline);
    record.answers[answer.answer_id] = {
      answer_id: answer.answer_id,
      question_id: answer.question_id,
      turn_index: answer.turn_index,
      envelope,
      flags,
      availability,
      influenced: "none",
      attention_flag_use: null,
      team3: { report: result.report, percentages: result.percentages },
    };
    if (calibration && availability !== "none") record.baseline_answer_id = answer.answer_id;
    record.pending = { answer_id: answer.answer_id, flags };
  } catch (caught) {
    record.answers_without_signals.push(answer.answer_id);
    audit(
      "schema_repair",
      `behavioral envelope dropped: ${String(caught).slice(0, 160)}`,
      session.session_id,
    );
  }
  saveBehavioral(record);
}

/**
 * Flags for the next 02 turn. `undefined` = key absent from session_state (capture disabled);
 * `[]` = capture on, nothing flagged. Only `high` items can act (02 S4.b); all are passed so
 * the report can show what 02 saw.
 */
export function flagsForNextTurn(session: RealSession): AttentionFlagItem[] | undefined {
  if (!captureEnabled(session)) return undefined;
  return loadBehavioral(session.session_id).pending?.flags ?? [];
}

/** §14 rule 3 input: did a `high` flag fire on the answer just ingested? */
export function highFlagFired(session: RealSession): boolean {
  if (!captureEnabled(session)) return false;
  return (loadBehavioral(session.session_id).pending?.flags ?? []).some(
    (f) => f.strength === "high",
  );
}

/** Record how 02 says it used the flags of the answer it just reacted to (§12.3 → §12.4). */
export function recordFlagUse(session: RealSession, use: unknown): void {
  if (!captureEnabled(session)) return;
  const record = loadBehavioral(session.session_id);
  const pending = record.pending;
  if (!pending) return;
  const entry = record.answers[pending.answer_id];
  if (!entry) return;
  const useValue = typeof use === "string" ? use : "none";
  const boosted = session.budget_audit.some(
    (row) => row.answer_id === pending.answer_id && row.attention_boost === true,
  );
  const influenced: FlagInfluence = boosted
    ? "budget_boost"
    : useValue === "selected_probe_order"
      ? "probe_order"
      : "none";
  record.answers[pending.answer_id] = { ...entry, attention_flag_use: useValue, influenced };
  record.pending = null;
  saveBehavioral(record);
}
