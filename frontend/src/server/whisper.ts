import "server-only";
import { getServerEnv } from "@/lib/config/env";

/** Team 4 speech analysis (voice_to_text/team4_speech.py), returned with every transcription. */
export interface Team4Speech {
  duration: number;
  total_words: number;
  wpm: number;
  filler_count: number;
  filler_words: Record<string, number>;
  repetition_count: number;
  repetitions: string[];
  total_pauses: number;
  long_pauses: number;
  average_pause: number;
  longest_pause: number;
  fluency_score: number;
  source: string;
}

export interface Transcription {
  text: string;
  language: string | null;
  duration_sec: number;
  segments: { start: number; end: number; text: string }[];
  speech?: Team4Speech | null;
}

/**
 * Client for voice_to_text/server.py (POST /transcribe, multipart "file" = 16 kHz mono WAV).
 * `hint` biases spelling toward names and domain terms (built from the JD + resume).
 */
export async function transcribeWav(
  wav: Buffer,
  options: { language?: string | null; hint?: string } = {},
): Promise<Transcription> {
  const base = getServerEnv().WHISPER_URL.replace(/\/$/, "");
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "answer.wav");
  if (options.language) form.set("language", options.language);
  if (options.hint) form.set("hint", options.hint.slice(0, 500));
  const response = await fetch(`${base}/transcribe`, {
    method: "POST",
    body: form,
    headers: serviceAuth(),
  });
  if (!response.ok) {
    throw new Error(`Whisper service ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as Transcription;
}

/** Bearer token for the Python services when SERVICE_TOKEN is set (public Space URLs). */
export function serviceAuth(): Record<string, string> {
  const token = getServerEnv().SERVICE_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function whisperHealthy(): Promise<boolean> {
  try {
    const base = getServerEnv().WHISPER_URL.replace(/\/$/, "");
    // Cloud services scale to zero; a cold start takes ~10 s, so the health probe waits longer.
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(20000) });
    return response.ok;
  } catch {
    return false;
  }
}
