import { z } from "zod";

/**
 * Public (browser-safe) environment. Every NEXT_PUBLIC_* value is inlined at build time,
 * so it must be read via the literal `process.env.NEXT_PUBLIC_*` form below.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_API_MODE: z.enum(["mock", "real"]).default("mock"),
  /** Absolute URL of a separate BFF, or a same-origin path such as "/api/v1". */
  NEXT_PUBLIC_API_BASE_URL: z
    .string()
    .regex(/^(https?:\/\/[^\s]+|\/[^\s]*)$/, "must be an absolute URL or a path starting with /")
    .optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (!parsedPublic.success) {
  throw new Error(`Invalid public environment: ${parsedPublic.error.message}`);
}

export const publicEnv = parsedPublic.data;

/** Resolved base path for API calls. Mock mode is served by this app's own route handlers. */
export const apiBaseUrl =
  publicEnv.NEXT_PUBLIC_API_MODE === "mock"
    ? "/api/mock"
    : (publicEnv.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1");

/** Server-only environment. Never import from a client component. */
const serverSchema = z.object({
  CONSOLE_DEV_PASSWORD: z.string().min(1).default("change-me"),
  CONSOLE_COOKIE_SECRET: z.string().min(16).default("dev-only-secret-not-for-production"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Gemini key — server only. Never prefixed NEXT_PUBLIC. */
  GEMINI_API_KEY: z.string().min(10).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash"),
  /** Whisper HTTP service (voice_to_text/server.py). */
  WHISPER_URL: z.string().url().default("http://127.0.0.1:8008"),
  /** Body-language signal service (body_language/server.py wrapping Team 3). */
  BODY_LANGUAGE_URL: z.string().url().default("http://127.0.0.1:8009"),
  /** Directory holding prompts_v2/*.md. Defaults to ../prompts_v2 relative to the app. */
  PROMPTS_DIR: z.string().optional(),
  /** Where real-mode sessions are persisted as JSON. */
  DATA_DIR: z.string().default(".data"),
});

export function getServerEnv() {
  const parsed = serverSchema.safeParse({
    CONSOLE_DEV_PASSWORD: process.env.CONSOLE_DEV_PASSWORD,
    CONSOLE_COOKIE_SECRET: process.env.CONSOLE_COOKIE_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    WHISPER_URL: process.env.WHISPER_URL || undefined,
    BODY_LANGUAGE_URL: process.env.BODY_LANGUAGE_URL || undefined,
    PROMPTS_DIR: process.env.PROMPTS_DIR || undefined,
    DATA_DIR: process.env.DATA_DIR || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
