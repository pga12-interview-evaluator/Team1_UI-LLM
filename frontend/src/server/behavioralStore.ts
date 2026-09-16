import "server-only";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { getServerEnv } from "@/lib/config/env";
import { kv, kvEnabled } from "./kv";
import type { AttentionFlagItem, BehavioralEnvelope, FlagsAvailability } from "./engine/behavioral";

/**
 * Separate store for behavioral signals (00 §12.4): keyed by session + answer, persisted apart
 * from the session record so scores and transcript never sit next to signals, and purged as a
 * unit on opt-out / accommodation. Nothing in the 03/04 payload builders reads this file.
 */

export type FlagInfluence = "none" | "probe_order" | "budget_boost";

export interface BehavioralAnswerRecord {
  answer_id: string;
  question_id: string;
  turn_index: number;
  envelope: BehavioralEnvelope;
  flags: AttentionFlagItem[];
  availability: FlagsAvailability;
  influenced: FlagInfluence;
  attention_flag_use: string | null;
  /** Team 3's own per-answer summary, kept for their team's inspection only (never rendered). */
  team3: { report: Record<string, unknown>; percentages: Record<string, number> };
}

export interface BehavioralRecord {
  session_id: string;
  baseline_answer_id: string | null;
  answers: Record<string, BehavioralAnswerRecord>;
  /** Answers where capture was enabled but the service returned nothing usable. */
  answers_without_signals: string[];
  /** Flags of the most recent answer; consumed by the next Prompt 02 turn. */
  pending: { answer_id: string; flags: AttentionFlagItem[] } | null;
  updated_at: string;
}

declare global {
  var __interviewBehavioralStore: Map<string, BehavioralRecord> | undefined;
}

function dir(): string {
  const folder = path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    getServerEnv().DATA_DIR,
    "behavioral",
  );
  if (!existsSync(/*turbopackIgnore: true*/ folder))
    mkdirSync(/*turbopackIgnore: true*/ folder, { recursive: true });
  return folder;
}

function file(sessionId: string): string {
  return path.join(dir(), `${sessionId}.json`);
}

const KV_INDEX = "index:behavioral";

function cache(): Map<string, BehavioralRecord> {
  if (!globalThis.__interviewBehavioralStore) globalThis.__interviewBehavioralStore = new Map();
  return globalThis.__interviewBehavioralStore;
}

/** Cloud mode: hydrate every record once (called from ensureLoaded in store.ts). */
export async function hydrateBehavioral(): Promise<void> {
  if (!kvEnabled()) return;
  for (const record of await kv.allJson<BehavioralRecord>(KV_INDEX))
    cache().set(record.session_id, record);
}

export function loadBehavioral(sessionId: string): BehavioralRecord {
  const cached = cache().get(sessionId);
  if (cached) return cached;
  let record: BehavioralRecord = {
    session_id: sessionId,
    baseline_answer_id: null,
    answers: {},
    answers_without_signals: [],
    pending: null,
    updated_at: new Date().toISOString(),
  };
  if (kvEnabled()) {
    cache().set(sessionId, record); // not in Redis either: start clean, mirror on first save
    return record;
  }
  const target = file(sessionId);
  if (existsSync(/*turbopackIgnore: true*/ target)) {
    try {
      record = JSON.parse(
        readFileSync(/*turbopackIgnore: true*/ target, "utf8"),
      ) as BehavioralRecord;
    } catch {
      /* corrupt file: start clean; signals are non-scored and reconstructible from the service reports */
    }
  }
  cache().set(sessionId, record);
  return record;
}

export function saveBehavioral(record: BehavioralRecord): void {
  const next = { ...record, updated_at: new Date().toISOString() };
  cache().set(record.session_id, next);
  if (kvEnabled()) {
    kv.putJson(KV_INDEX, `behavioral:${record.session_id}`, next).catch((caught) =>
      console.error("[behavioral] not persisted:", caught),
    );
    return;
  }
  const target = file(record.session_id);
  const tmp = `${target}.tmp`;
  writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(next), "utf8");
  renameSync(/*turbopackIgnore: true*/ tmp, target);
}

/** Purge on opt-out or accommodation (§12.4). */
export function purgeBehavioral(sessionId: string): void {
  cache().delete(sessionId);
  if (kvEnabled()) {
    kv.delJson(KV_INDEX, `behavioral:${sessionId}`).catch((caught) =>
      console.error("[behavioral] not purged:", caught),
    );
    return;
  }
  const target = file(sessionId);
  if (existsSync(/*turbopackIgnore: true*/ target)) unlinkSync(/*turbopackIgnore: true*/ target);
}
