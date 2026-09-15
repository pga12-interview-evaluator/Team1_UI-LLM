import "server-only";
import { getServerEnv } from "@/lib/config/env";

export interface Transcription {
  text: string;
  language: string | null;
  duration_sec: number;
  segments: { start: number; end: number; text: string }[];
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
  const response = await fetch(`${base}/transcribe`, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`Whisper service ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as Transcription;
}

export async function whisperHealthy(): Promise<boolean> {
  try {
    const base = getServerEnv().WHISPER_URL.replace(/\/$/, "");
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}
