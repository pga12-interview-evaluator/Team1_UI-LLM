import "server-only";
import type { FinalReport } from "@/lib/api/schemas/console";
import { loadBehavioral } from "../behavioralStore";
import type { RealSession } from "../store";
import { FUSION_RULES_VERSION } from "./behavioral";

type BehavioralContext = NonNullable<FinalReport["non_scored_behavioral_context"]>;

const DISCLAIMER =
  "Non-scored context. These behavioral signals were not used in any competency score, finding, or recommendation above and must not be used by a reviewer to adjust them. Automated behavior analysis does not detect deception. Shown for follow-up-question audit only.";

/**
 * 00 §12.4 — injected into the 04 report AFTER validation, built from the separate behavioral
 * store only. Counts and flags, never numeric metrics or stills.
 */
export function behavioralContext(session: RealSession): BehavioralContext {
  const answered = session.evaluations.length;
  const base = {
    disclaimer: DISCLAIMER,
    coverage: { answers_with_signals: 0, answers_partial: 0, answers_without: answered },
    flags_by_answer: [] as BehavioralContext["flags_by_answer"],
    integrity_events: [] as BehavioralContext["integrity_events"],
    environment_quality_summary: "",
    producer_versions: [] as string[],
    used_in_scoring: false as const,
    shown_by_default: false as const,
  };
  if (!session.consent.behavioral_analysis_consent)
    return { ...base, capture_status: "disabled_by_consent" };
  if (session.accommodations.length > 0)
    return { ...base, capture_status: "disabled_by_accommodation" };
  if (!session.device.camera || !session.consent.recording_consent)
    return {
      ...base,
      capture_status: "none",
      environment_quality_summary: "Camera was not available.",
    };

  const record = loadBehavioral(session.session_id);
  const entries = Object.values(record.answers).sort((a, b) => a.turn_index - b.turn_index);
  const full = entries.filter((e) => e.availability === "full").length;
  const partial = entries.filter((e) => e.availability === "partial").length;
  const without = Math.max(0, answered - full - partial);
  const capture_status: BehavioralContext["capture_status"] =
    entries.length === 0 ? "none" : without === 0 && partial === 0 ? "full" : "partial";
  const quality = entries.map((e) => e.envelope.environment.network_quality);
  const poor = quality.filter((q) => q === "poor").length;
  const producerVersions = new Set<string>([FUSION_RULES_VERSION]);
  for (const entry of entries)
    for (const producer of entry.envelope.producers)
      if (producer.status !== "missing")
        producerVersions.add(`${producer.service}:${producer.model_version}`);

  return {
    ...base,
    capture_status,
    coverage: { answers_with_signals: full, answers_partial: partial, answers_without: without },
    flags_by_answer: entries
      .filter((e) => e.flags.length > 0)
      .map((e) => ({
        answer_id: e.answer_id,
        question_id: e.question_id,
        flags: e.flags.map((f) => ({
          flag: f.flag,
          strength: f.strength,
          influenced: e.influenced,
          resolved_by_probe: null,
          resolution_note: null,
        })),
      })),
    integrity_events: entries.flatMap((e) =>
      e.envelope.integrity_events.map((event) => ({
        type: event.type,
        answer_id: e.answer_id,
        duration_ms: event.duration_ms,
      })),
    ),
    environment_quality_summary:
      entries.length === 0
        ? "No frames were received."
        : poor === 0
          ? `Camera coverage was adequate on all ${entries.length} captured answers.`
          : `Camera coverage was poor on ${poor} of ${entries.length} captured answers.`,
    producer_versions: [...producerVersions],
  };
}
