import type {
  AuditEvent,
  BudgetAuditRow,
  EvaluationSummary,
  FinalReport,
  HumanDecision,
  Requisition,
  TranscriptEntry,
} from "@/lib/api/schemas/console";
import type {
  AccommodationCode,
  CandidateSessionStatus,
  CandidateTurnDto,
} from "@/lib/api/schemas/candidate";

/** Mock session record. Holds everything the mock engine and both channels need. */
export interface MockSession {
  session_id: string;
  invite_token: string;
  requisition_id: string;
  candidate_label: string;
  interview_language: string;
  status: CandidateSessionStatus;
  consent: {
    ai_interview_notice_ack: boolean;
    recording_consent: boolean;
    behavioral_analysis_consent: boolean;
    notice_version: string;
  };
  device: { camera: boolean; microphone: boolean };
  accommodations: AccommodationCode[];
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  escalation_reason: string | null;
  // interview progress
  plan_index: number; // index into PLAN of the current main question
  anchors_asked: boolean;
  probes_used: number;
  probe_budget: number;
  probes_total: number;
  revealed_facts: number[];
  pending_question_text: string | null;
  turn_index: number;
  current_turn: CandidateTurnDto | null;
  transcript: TranscriptEntry[];
  evaluations: EvaluationSummary[];
  budget_audit: BudgetAuditRow[];
  candidate_questions_asked: number;
  report: FinalReport | null;
  human_decision: HumanDecision | null;
  /** Server-side "evaluating" delay simulation end time. */
  evaluating_until: number | null;
  next_after_evaluation: CandidateTurnDto | null;
}

interface MockDb {
  requisitions: Map<string, Requisition>;
  sessions: Map<string, MockSession>;
  tokens: Map<string, string>;
  audit: AuditEvent[];
  listeners: Map<string, Set<(session: MockSession) => void>>;
  seeded: boolean;
}

declare global {
  var __interviewMockDb: MockDb | undefined;
}

/** Module state survives HMR and route-handler isolation through globalThis. Dev/test only. */
export function db(): MockDb {
  if (!globalThis.__interviewMockDb) {
    globalThis.__interviewMockDb = {
      requisitions: new Map(),
      sessions: new Map(),
      tokens: new Map(),
      audit: [],
      listeners: new Map(),
      seeded: false,
    };
  }
  return globalThis.__interviewMockDb;
}

export function audit(
  kind: AuditEvent["kind"],
  detail: string,
  session_id: string | null = null,
): void {
  db().audit.unshift({
    id: `ae_${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    session_id,
    kind,
    detail,
  });
  if (db().audit.length > 500) db().audit.length = 500;
}

export function subscribe(sessionId: string, listener: (session: MockSession) => void): () => void {
  const set = db().listeners.get(sessionId) ?? new Set();
  set.add(listener);
  db().listeners.set(sessionId, set);
  return () => set.delete(listener);
}

export function publish(session: MockSession): void {
  db()
    .listeners.get(session.session_id)
    ?.forEach((listener) => listener(session));
}
