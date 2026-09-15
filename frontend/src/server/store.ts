import "server-only";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { getServerEnv } from "@/lib/config/env";
import type {
  AuditEvent,
  EvaluationSummary,
  HumanDecision,
  TranscriptEntry,
} from "@/lib/api/schemas/console";
import type {
  AccommodationCode,
  CandidateSessionStatus,
  CandidateTurnDto,
} from "@/lib/api/schemas/candidate";

/**
 * Real-mode session record. Persisted as JSON under DATA_DIR so a dev-server restart does not
 * lose a running interview. Audio bytes are kept in memory only (per turn) until transcribed.
 */
export interface RealSession {
  session_id: string;
  invite_token: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  status: CandidateSessionStatus;
  escalation_reason: string | null;
  candidate_label: string;
  interview_input: Record<string, unknown>; // interview_input/2.0 per 00 §3
  policy_snapshot: Record<string, unknown>;
  resume_text: string;
  blueprint: Record<string, unknown> | null;
  blueprint_error: string | null;
  consent: {
    ai_interview_notice_ack: boolean;
    recording_consent: boolean;
    behavioral_analysis_consent: boolean;
    notice_version: string;
  };
  device: { camera: boolean; microphone: boolean };
  accommodations: AccommodationCode[];
  // live state
  current_question_id: string | null;
  completed_question_ids: string[];
  skipped_question_ids: string[];
  probe_index: number;
  probe_budget_remaining: number;
  probe_budget_reason: string;
  probe_pool_remaining: number;
  probes_total: number;
  evaluator_directives: unknown[];
  premises_remaining: number;
  callbacks_remaining: number;
  reconciliations_remaining: number;
  mutations_used: string[];
  reframe_used: boolean;
  case_state: Record<string, unknown> | null;
  ledger: Record<string, unknown>[]; // claim_ledger_entry-ish rows
  digests: {
    question_id: string;
    digest: string;
    evidence_grade: string;
    unresolved_claim_ids: string[];
  }[];
  phase: "opening" | "main" | "reserve" | "candidate_questions" | "closing";
  candidate_questions_asked: number;
  pending_question_text: string | null;
  turn_index: number;
  current_turn: CandidateTurnDto | null;
  evaluating: boolean;
  transcript: TranscriptEntry[];
  evaluations_raw: Record<string, unknown>[]; // full 03 outputs (last per question wins for 04)
  evaluations: EvaluationSummary[]; // console projection
  budget_audit: Record<string, unknown>[];
  answer_ids: Record<string, string>; // turn_index -> answer_id
  media_refs: Record<string, { turn_index: number; transcript: string | null }>;
  report_raw: Record<string, unknown> | null;
  human_decision: HumanDecision | null;
  gemini_log: {
    stage: string;
    at: string;
    latency_ms: number;
    prompt_tokens: number;
    output_tokens: number;
    ok: boolean;
    error?: string;
  }[];
}

interface RealDb {
  sessions: Map<string, RealSession>;
  tokens: Map<string, string>;
  audio: Map<string, Buffer>; // media_ref -> wav bytes (memory only)
  pending: Map<string, Promise<void>>; // blueprint generation in flight
  audit: AuditEvent[];
  listeners: Map<string, Set<(s: RealSession) => void>>;
  loaded: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __interviewRealDb: RealDb | undefined;
}

function dataDir(): string {
  const dir = path.resolve(process.cwd(), getServerEnv().DATA_DIR);
  const sessions = path.join(dir, "sessions");
  if (!existsSync(/*turbopackIgnore: true*/ sessions))
    mkdirSync(/*turbopackIgnore: true*/ sessions, { recursive: true });
  return dir;
}

export function db(): RealDb {
  if (!globalThis.__interviewRealDb) {
    globalThis.__interviewRealDb = {
      sessions: new Map(),
      tokens: new Map(),
      audio: new Map(),
      pending: new Map(),
      audit: [],
      listeners: new Map(),
      loaded: false,
    };
  }
  const store = globalThis.__interviewRealDb;
  if (!store.loaded) {
    store.loaded = true;
    const dir = path.join(dataDir(), "sessions");
    for (const file of readdirSync(/*turbopackIgnore: true*/ dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const session = JSON.parse(
          readFileSync(/*turbopackIgnore: true*/ path.join(dir, file), "utf8"),
        ) as RealSession;
        // A restart mid-evaluation cannot resume the Gemini call; surface the pending question again.
        if (session.evaluating) session.evaluating = false;
        store.sessions.set(session.session_id, session);
        store.tokens.set(session.invite_token, session.session_id);
      } catch {
        /* skip corrupt file */
      }
    }
    const auditFile = path.join(dataDir(), "audit.json");
    if (existsSync(/*turbopackIgnore: true*/ auditFile)) {
      try {
        store.audit = JSON.parse(
          readFileSync(/*turbopackIgnore: true*/ auditFile, "utf8"),
        ) as AuditEvent[];
      } catch {
        store.audit = [];
      }
    }
  }
  return store;
}

export function save(session: RealSession): void {
  const file = path.join(dataDir(), "sessions", `${session.session_id}.json`);
  const tmp = `${file}.tmp`;
  writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(session), "utf8");
  renameSync(/*turbopackIgnore: true*/ tmp, file);
  db()
    .listeners.get(session.session_id)
    ?.forEach((listener) => listener(session));
}

export function audit(
  kind: AuditEvent["kind"],
  detail: string,
  session_id: string | null = null,
): void {
  const store = db();
  store.audit.unshift({
    id: `ae_${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    session_id,
    kind,
    detail,
  });
  if (store.audit.length > 1000) store.audit.length = 1000;
  writeFileSync(
    /*turbopackIgnore: true*/ path.join(dataDir(), "audit.json"),
    JSON.stringify(store.audit),
    "utf8",
  );
}

export function subscribe(sessionId: string, listener: (s: RealSession) => void): () => void {
  const set = db().listeners.get(sessionId) ?? new Set();
  set.add(listener);
  db().listeners.set(sessionId, set);
  return () => set.delete(listener);
}

export function sessionByToken(token: string): RealSession | null {
  const id = db().tokens.get(token);
  return id ? (db().sessions.get(id) ?? null) : null;
}

export function sessionById(id: string): RealSession | null {
  return db().sessions.get(id) ?? null;
}

export function allSessions(): RealSession[] {
  return Array.from(db().sessions.values());
}
