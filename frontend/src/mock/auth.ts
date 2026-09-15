import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/config/env";
import type { ConsoleUser } from "@/lib/api/schemas/console";

export const CONSOLE_COOKIE = "console_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

interface CookiePayload {
  user_id: string;
  display_name: string;
  role: ConsoleUser["role"];
  exp: number;
}

function sign(value: string): string {
  return createHmac("sha256", getServerEnv().CONSOLE_COOKIE_SECRET)
    .update(value)
    .digest("base64url");
}

/** Signed, HttpOnly, SameSite=Strict cookie. Dev-grade session; swap for your IdP in production. */
export function issueCookie(user: ConsoleUser): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  const payload: CookiePayload = { ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    name: CONSOLE_COOKIE,
    value: `${encoded}.${sign(encoded)}`,
    options: {
      httpOnly: true,
      sameSite: "strict",
      secure: getServerEnv().NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

export function readCookie(raw: string | undefined): ConsoleUser | null {
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as CookiePayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return { user_id: payload.user_id, display_name: payload.display_name, role: payload.role };
  } catch {
    return null;
  }
}

/** Dev directory. Replace with SSO. */
export function authenticate(email: string, password: string): ConsoleUser | null {
  if (password !== getServerEnv().CONSOLE_DEV_PASSWORD) return null;
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return null;
  const role: ConsoleUser["role"] = normalized.startsWith("admin")
    ? "admin"
    : normalized.startsWith("reviewer")
      ? "reviewer"
      : "recruiter";
  return {
    user_id: `u_${Buffer.from(normalized).toString("base64url").slice(0, 12)}`,
    display_name: normalized.split("@")[0],
    role,
  };
}
