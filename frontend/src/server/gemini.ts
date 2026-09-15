import "server-only";
import { getServerEnv } from "@/lib/config/env";

/**
 * Minimal Gemini REST client (generateContent) for the four prompt stages.
 * The system instruction is the prompts_v2 text with its data block substituted;
 * the user turn is a fixed nudge. JSON-only output is requested; the caller validates.
 */

export type Stage = "01" | "02" | "03" | "04";

const STAGE_CONFIG: Record<Stage, { temperature: number; thinking: number; maxOutput: number }> = {
  "01": { temperature: 0.2, thinking: 4096, maxOutput: 32000 },
  "02": { temperature: 0.25, thinking: 1024, maxOutput: 3200 },
  "03": { temperature: 0.15, thinking: 2048, maxOutput: 10240 },
  "04": { temperature: 0.1, thinking: 4096, maxOutput: 24000 },
};

export class GeminiError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.retryable = status === 429 || status === 503 || status >= 500;
  }
}

interface CallResult<T> {
  data: T;
  raw: string;
  usage: { prompt: number; output: number };
  latency_ms: number;
  model: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip accidental fences and find the outermost JSON object. */
function extractJson(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new GeminiError(422, "Model returned no JSON object.");
  return trimmed.slice(start, end + 1);
}

export async function callGemini<T = unknown>(
  stage: Stage,
  systemInstruction: string,
  options: { signal?: AbortSignal; retries?: number } = {},
): Promise<CallResult<T>> {
  const env = getServerEnv();
  if (!env.GEMINI_API_KEY) {
    throw new GeminiError(
      500,
      "GEMINI_API_KEY is not set. Add it to frontend/.env.local (server-only).",
    );
  }
  const cfg = STAGE_CONFIG[stage];
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [
      {
        role: "user",
        parts: [{ text: "Produce the JSON output for the data block in your instructions." }],
      },
    ],
    generationConfig: {
      candidateCount: 1,
      responseMimeType: "application/json",
      temperature: cfg.temperature,
      maxOutputTokens: cfg.maxOutput + cfg.thinking,
      thinkingConfig: { thinkingBudget: cfg.thinking },
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const retries = options.retries ?? 2;
  let attempt = 0;
  for (;;) {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (caught) {
      if (attempt < retries) {
        attempt += 1;
        await sleep(1500 * attempt);
        continue;
      }
      throw new GeminiError(0, `Network error calling Gemini: ${String(caught)}`);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      const error = new GeminiError(response.status, `Gemini ${response.status}: ${detail}`);
      if (error.retryable && attempt < retries) {
        attempt += 1;
        await sleep(4000 * attempt);
        continue;
      }
      throw error;
    }
    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const candidate = payload.candidates?.[0];
    const raw = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!raw)
      throw new GeminiError(
        502,
        `Gemini returned an empty candidate (finishReason=${candidate?.finishReason ?? "?"}).`,
      );
    let data: T;
    try {
      data = JSON.parse(extractJson(raw)) as T;
    } catch (parseError) {
      // Malformed JSON is usually a one-off (truncation, a stray fence, an unescaped quote):
      // one fresh attempt beats failing the whole interview. Keep the tail for the audit log.
      if (attempt < retries) {
        attempt += 1;
        await sleep(1000 * attempt);
        continue;
      }
      const tail = raw.replace(/\s+/g, " ").slice(-160);
      throw new GeminiError(
        422,
        `Gemini output was not valid JSON (finishReason=${candidate?.finishReason ?? "?"}, ${String(
          (parseError as Error).message,
        ).slice(0, 80)}). Tail: …${tail}`,
      );
    }
    return {
      data,
      raw,
      usage: {
        prompt: payload.usageMetadata?.promptTokenCount ?? 0,
        output: payload.usageMetadata?.candidatesTokenCount ?? 0,
      },
      latency_ms: Date.now() - started,
      model: env.GEMINI_MODEL,
    };
  }
}
