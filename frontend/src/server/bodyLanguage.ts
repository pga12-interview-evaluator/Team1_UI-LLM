import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { serviceAuth } from "./whisper";

/**
 * Client for body_language/server.py (Team 3's body-language analysis behind HTTP).
 * Frames go up per answer; `finalizeTurn` returns Team 3's report plus the reduced metrics the
 * engine maps into a behavioral_signals/1.0 envelope. Every call is best-effort: a dead service
 * must never block an interview, so callers treat null as "no signals for this answer".
 */

export interface BodyLanguageDerived {
  calibrated: boolean;
  duration_ms: number;
  frames_total: number;
  frames_detected: number;
  coverage_ratio: number;
  on_screen_ratio: number;
  off_screen_saccade_count: number;
  sustained_off_screen_ms_max: number;
  off_screen_events: { at_ms: number; duration_ms: number }[];
  face_visible_ratio: number;
  posture_shift_count: number;
  face_out_of_frame_ms: number;
  face_absent_events: { at_ms: number; duration_ms: number }[];
  processing_latency_ms: number;
  analysis_mode: "ML" | "rule_based";
  service_version: string;
}

export interface BodyLanguageResult {
  turn_index: number;
  report: Record<string, unknown>;
  percentages: Record<string, number>;
  interval_seconds: number;
  intervals: Record<string, unknown>[];
  derived: BodyLanguageDerived;
}

const FRAMES_TIMEOUT_MS = 8000;
const FINALIZE_TIMEOUT_MS = 6000;

function base(): string {
  return getServerEnv().BODY_LANGUAGE_URL.replace(/\/$/, "");
}

/** Forward a batch of JPEG frames (filename `<t_ms>.jpg`) for one answer turn. */
export async function pushFrames(
  sessionId: string,
  turnIndex: number,
  frames: { t_ms: number; bytes: Buffer }[],
): Promise<{ received: number; detected: number; calibrated: boolean } | null> {
  if (!frames.length) return null;
  const form = new FormData();
  form.set("turn_index", String(turnIndex));
  for (const frame of frames) {
    form.append(
      "frames",
      new Blob([new Uint8Array(frame.bytes)], { type: "image/jpeg" }),
      `${frame.t_ms}.jpg`,
    );
  }
  try {
    const response = await fetch(`${base()}/sessions/${encodeURIComponent(sessionId)}/frames`, {
      method: "POST",
      body: form,
      headers: serviceAuth(),
      signal: AbortSignal.timeout(FRAMES_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as { received: number; detected: number; calibrated: boolean };
  } catch {
    return null;
  }
}

/** Close the answer window: 5-second averages + per-answer report. null when nothing was captured. */
export async function finalizeTurn(
  sessionId: string,
  turnIndex: number,
): Promise<BodyLanguageResult | null> {
  try {
    const response = await fetch(
      `${base()}/sessions/${encodeURIComponent(sessionId)}/turns/${turnIndex}/finalize`,
      { method: "POST", headers: serviceAuth(), signal: AbortSignal.timeout(FINALIZE_TIMEOUT_MS) },
    );
    if (!response.ok) return null;
    return (await response.json()) as BodyLanguageResult;
  } catch {
    return null;
  }
}

/** Release the landmarkers for a finished session (fire-and-forget). */
export async function releaseSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${base()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: serviceAuth(),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* service down or session unknown — nothing to release */
  }
}

export async function bodyLanguageHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${base()}/health`, { signal: AbortSignal.timeout(20000) });
    return response.ok;
  } catch {
    return false;
  }
}
