export interface PracticeSession {
  token: string;
  sessionId: string;
  role: string;
  createdAt: string;
  status: "started" | "completed";
}
const KEY = "interviewly.sessions.v1";
export function readHistory(): PracticeSession[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is PracticeSession =>
        !!s &&
        typeof s === "object" &&
        typeof s.token === "string" &&
        /^[A-Za-z0-9_-]{3,128}$/.test(s.token) &&
        typeof s.role === "string" &&
        typeof s.createdAt === "string" &&
        Number.isFinite(Date.parse(s.createdAt)) &&
        (s.status === "started" || s.status === "completed"),
    );
  } catch {
    return [];
  }
}
export function saveSession(session: PracticeSession) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [session, ...readHistory().filter((s) => s.token !== session.token)].slice(0, 30),
      ),
    );
  } catch {
    /* Storage may be unavailable. */
  }
}
export function completeSession(token: string) {
  const session = readHistory().find((s) => s.token === token);
  if (session) saveSession({ ...session, status: "completed" });
}
