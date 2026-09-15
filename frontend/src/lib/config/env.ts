import { z } from "zod";

/**
 * Public (browser-safe) environment. Every NEXT_PUBLIC_* value is inlined at build time,
 * so it must be read via the literal `process.env.NEXT_PUBLIC_*` form below.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_API_MODE: z.enum(["mock", "real"]).default("mock"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().optional(),
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
});

export function getServerEnv() {
  const parsed = serverSchema.safeParse({
    CONSOLE_DEV_PASSWORD: process.env.CONSOLE_DEV_PASSWORD,
    CONSOLE_COOKIE_SECRET: process.env.CONSOLE_COOKIE_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
