import "server-only";
import { NextResponse } from "next/server";
import {
  answerPayloadSchema,
  candidateRequestPayloadSchema,
  consentPayloadSchema,
} from "@/lib/api/schemas/candidate";
import { humanDecisionInputSchema } from "@/lib/api/schemas/console";
import { practiceInputSchema, resumeError } from "@/lib/api/schemas/setup";
import { authenticate, issueCookie, readCookie } from "@/mock/auth";
import * as engine from "./engine/orchestrator";
import { candidateView, detail, projectReport, requisitionOf, summary } from "./engine/projection";
import { GeminiError } from "./gemini";
import { extractResumeText, redactResume } from "./resume";
import {
  allSessions,
  audit,
  db,
  save,
  sessionById,
  sessionByToken,
  subscribe,
  type RealSession,
} from "./store";
import { whisperHealthy } from "./whisper";
import { bodyLanguageHealthy, pushFrames } from "./bodyLanguage";
import { captureEnabled } from "./engine/behavioralFlow";
import { buildPracticeReview } from "./engine/review";

/* ---------------- shared ---------------- */

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function error(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return json({ code, message, details }, status);
}

function fromError(caught: unknown): NextResponse {
  if (caught instanceof GeminiError) {
    const status =
      caught.status === 409
        ? 409
        : caught.status === 0
          ? 503
          : caught.status >= 500 || caught.status === 429
            ? 503
            : 502;
    return error(status, "model_error", caught.message);
  }
  return error(500, "server_error", caught instanceof Error ? caught.message : String(caught));
}

async function body<T>(request: Request, parse: (input: unknown) => T): Promise<T | NextResponse> {
  try {
    return parse(await request.json());
  } catch (caught) {
    return error(400, "invalid_body", "Request body failed validation.", String(caught));
  }
}

/** Serialize per-session work: two concurrent answers/requests must not interleave state. */
const locks = new Map<string, Promise<void>>();
async function withLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(sessionId) ?? Promise.resolve();
  let release: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    sessionId,
    previous.then(() => next),
  );
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(sessionId) === next) locks.delete(sessionId);
  }
}

/* ---------------- candidate channel ---------------- */

export async function candidateRoute(request: Request, segments: string[]): Promise<NextResponse> {
  const method = request.method.toUpperCase();

  // POST /candidate/sessions  — practice setup: resume + settings → session (blueprint runs in the background)
  if (segments.length === 2 && segments[1] === "sessions" && method === "POST") {
    const form = await request.formData();
    const resume = form.get("resume");
    if (!(resume instanceof File))
      return error(400, "resume_required", "Upload your resume to continue.");
    const problem = resumeError(resume);
    if (problem) return error(400, "invalid_resume", problem);
    const parsed = practiceInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return error(400, "invalid_setup", "Check your interview details.", parsed.error.flatten());
    let resumeText: string;
    try {
      resumeText = redactResume(await extractResumeText(resume));
    } catch (caught) {
      return error(
        400,
        "resume_unreadable",
        "We could not read that file. Try a text-based PDF, DOCX or TXT.",
        String(caught),
      );
    }
    if (resumeText.trim().length < 80)
      return error(
        400,
        "resume_too_short",
        "We could not find enough text in the resume. Scanned PDFs are not supported.",
      );
    if (!process.env.GEMINI_API_KEY)
      return error(
        503,
        "model_not_configured",
        "GEMINI_API_KEY is not set on the server. See frontend/docs/RUNBOOK.md.",
      );
    const session = engine.createSession({
      ...parsed.data,
      resume_text: resumeText,
      interview_purpose: "mock_practice",
    });
    return json(
      { session_id: session.session_id, invite_token: session.invite_token, mode: "real" },
      201,
    );
  }

  const [, , token, action] = segments;
  if (!token) return error(404, "not_found", "Unknown route.");
  const session = sessionByToken(token);
  if (!session) return error(404, "not_found", "This interview link is not valid or has expired.");

  if (!action && method === "GET") return json(candidateView(session));
  if (action === "events" && method === "GET") return eventsStream(session);
  if (action === "review" && method === "GET") return reviewRoute(session);
  if (method !== "POST") return error(405, "method_not_allowed", "Method not allowed.");
  // Camera frames stream in every second; they must not queue behind a Gemini call on the session lock.
  if (action === "frames") return framesRoute(request, session);

  return withLock(session.session_id, async () => {
    try {
      switch (action) {
        case "consent": {
          const payload = await body(request, (input) => consentPayloadSchema.parse(input));
          if (payload instanceof NextResponse) return payload;
          if (session.status === "awaiting_consent")
            engine.consentGiven(session, { ...payload, ai_interview_notice_ack: true });
          return json(candidateView(session));
        }
        case "device-ready": {
          const payload = (await request.json().catch(() => ({}))) as {
            camera?: boolean;
            microphone?: boolean;
          };
          if (session.status === "device_check")
            engine.deviceReady(session, {
              camera: !!payload.camera,
              microphone: !!payload.microphone,
            });
          return json(candidateView(session));
        }
        case "start": {
          if (session.status === "ready") await engine.start(session);
          return json(candidateView(session));
        }
        case "answers": {
          const payload = await body(request, (input) => answerPayloadSchema.parse(input));
          if (payload instanceof NextResponse) return payload;
          if (session.current_turn && payload.turn_index !== session.current_turn.turn_index)
            return json(candidateView(session)); // idempotent replay
          if (session.evaluating) return json(candidateView(session));
          await engine.answer(session, {
            text: payload.text,
            media_ref: payload.media_ref,
            auto_submitted: payload.auto_submitted,
            turn_index: payload.turn_index,
          });
          return json(candidateView(session));
        }
        case "requests": {
          const payload = await body(request, (input) =>
            candidateRequestPayloadSchema.parse(input),
          );
          if (payload instanceof NextResponse) return payload;
          if (payload.type === "adjustment") engine.adjustment(session, payload.code);
          else await engine.request(session, payload.type);
          return json(candidateView(session));
        }
        case "media": {
          const form = await request.formData();
          const chunk = form.get("chunk");
          const turnIndex = Number(form.get("turn_index"));
          if (!(chunk instanceof Blob) || chunk.size === 0)
            return error(400, "empty_audio", "No audio received.");
          if (chunk.size > 25 * 1024 * 1024)
            return error(413, "audio_too_large", "Audio exceeds 25 MB.");
          const mediaRef = `media_${session.session_id}_${turnIndex}_${Date.now().toString(36)}`;
          db().audio.set(mediaRef, Buffer.from(await chunk.arrayBuffer()));
          session.media_refs[mediaRef] = { turn_index: turnIndex, transcript: null };
          save(session);
          return json({ media_ref: mediaRef, received_bytes: chunk.size });
        }
        default:
          return error(404, "not_found", "Unknown route.");
      }
    } catch (caught) {
      session.evaluating = false;
      save(session);
      return fromError(caught);
    }
  });
}

/**
 * GET …/review — the candidate's own practice review. Mock-practice sessions only (a hiring
 * candidate never sees scores); available once the session has ended. Generates the 04 report
 * on first open; if that fails the per-answer evaluation still comes back.
 */
async function reviewRoute(session: RealSession): Promise<NextResponse> {
  if (session.interview_input.interview_purpose !== "mock_practice")
    return error(403, "not_practice", "Reviews are available for practice interviews only.");
  if (!["closed", "escalated", "reported"].includes(session.status))
    return error(409, "not_finished", "Your review is ready once the interview has ended.");
  return withLock(session.session_id, async () => {
    let reportError: string | null = null;
    if (!session.report_raw) {
      try {
        await engine.generateReport(session);
      } catch (caught) {
        reportError = caught instanceof Error ? caught.message : String(caught);
      }
    }
    const report = session.report_raw ? projectReport(session) : null;
    return json(buildPracticeReview(session, report, reportError));
  });
}

const MAX_FRAMES_PER_BATCH = 16;
const MAX_FRAME_BYTES = 400 * 1024;

/**
 * POST …/frames — multipart `turn_index` + `frames[]` (JPEG, filename `<t_ms>.jpg`) → Team 3 service.
 * Accepted only while capture is on (consent + camera + no accommodation) and an answer is open;
 * otherwise 204 so the browser simply stops sending. Never fails the interview.
 */
async function framesRoute(request: Request, session: RealSession): Promise<NextResponse> {
  if (
    !captureEnabled(session) ||
    session.status !== "active" ||
    !session.current_turn?.requires_answer
  )
    return new NextResponse(null, { status: 204 });
  const form = await request.formData();
  const turnIndex = Number(form.get("turn_index"));
  if (!Number.isInteger(turnIndex) || turnIndex !== session.current_turn.turn_index)
    return new NextResponse(null, { status: 204 }); // stale batch from a previous question
  const frames: { t_ms: number; bytes: Buffer }[] = [];
  for (const entry of form.getAll("frames").slice(0, MAX_FRAMES_PER_BATCH)) {
    if (!(entry instanceof File) || entry.size === 0 || entry.size > MAX_FRAME_BYTES) continue;
    const t = Number(entry.name.replace(/\.jpe?g$/i, ""));
    if (!Number.isInteger(t) || t < 0) continue;
    frames.push({ t_ms: t, bytes: Buffer.from(await entry.arrayBuffer()) });
  }
  if (!frames.length) return error(400, "no_frames", "No usable frames in this batch.");
  const ack = await pushFrames(session.session_id, turnIndex, frames);
  return json({
    accepted: frames.length,
    detected: ack?.detected ?? 0,
    service_reachable: ack !== null,
  });
}

function eventsStream(session: RealSession): NextResponse {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send({ type: "status", session: candidateView(session) });
      unsubscribe = subscribe(session.session_id, (updated) =>
        send({ type: "turn", session: candidateView(updated) }),
      );
      heartbeat = setInterval(
        () => send({ type: "heartbeat", at: new Date().toISOString() }),
        15_000,
      );
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}

/* ---------------- console channel ---------------- */

function currentUser(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("console_session="));
  return readCookie(cookie?.split("=")[1]);
}

export async function consoleRoute(request: Request, segments: string[]): Promise<NextResponse> {
  const [, resource, id, action] = segments;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if (resource === "dev-login" && method === "POST") {
    if (process.env.NODE_ENV !== "development")
      return error(404, "not_found", "Development access is disabled.");
    const user = { user_id: "local_developer", display_name: "Developer", role: "admin" as const };
    const cookie = issueCookie(user);
    const response = json(user);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  }
  if (resource === "login" && method === "POST") {
    const payload = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const user = authenticate(payload.email ?? "", payload.password ?? "");
    if (!user) {
      audit("login", `failed for ${payload.email ?? "?"}`);
      return error(401, "invalid_credentials", "Sign-in failed.");
    }
    const cookie = issueCookie(user);
    const response = json(user);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    audit("login", `${user.display_name} (${user.role})`);
    return response;
  }
  if (resource === "logout" && method === "POST") {
    const response = json({ ok: true });
    response.cookies.set("console_session", "", { path: "/", maxAge: 0 });
    return response;
  }
  const user = currentUser(request);
  if (resource === "me") return json(user);
  if (!user) return error(401, "unauthenticated", "Sign in required.");

  if (resource === "health" && method === "GET") {
    return json({
      gemini_key_present: !!process.env.GEMINI_API_KEY,
      gemini_model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
      whisper_reachable: await whisperHealthy(),
      body_language_reachable: await bodyLanguageHealthy(),
      sessions: allSessions().length,
    });
  }

  if (resource === "requisitions") {
    // Real mode derives one read-only requisition per practice session (setup happens at /setup).
    const items = allSessions()
      .map(requisitionOf)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (!id && method === "GET") return json({ items, total: items.length });
    if (!id && method === "POST")
      return error(501, "not_supported", "Create interviews from /setup in this mode.");
    const found = items.find((r) => r.requisition_id === id);
    if (!found) return error(404, "not_found", "Requisition not found.");
    if (!action && method === "GET") return json(found);
    return error(
      501,
      "not_supported",
      "Blueprint lifecycle is per session in this mode; open the session instead.",
    );
  }

  if (resource === "sessions") {
    if (!id && method === "GET") {
      const filterReq = url.searchParams.get("requisition_id");
      const filterStatus = url.searchParams.get("status");
      const items = allSessions()
        .map(summary)
        .filter(
          (s) =>
            (!filterReq || s.requisition_id === filterReq) &&
            (!filterStatus || s.status === filterStatus),
        )
        .sort((a, b) => (b.started_at ?? "9").localeCompare(a.started_at ?? "9"));
      return json({ items, total: items.length });
    }
    const session = id ? sessionById(id) : null;
    if (!session) return error(404, "not_found", "Session not found.");
    if (!action && method === "GET") {
      try {
        return json(detail(session));
      } catch (caught) {
        return fromError(caught);
      }
    }
    if (action === "report" && method === "POST") {
      return withLock(session.session_id, async () => {
        try {
          await engine.generateReport(session);
          return json(projectReport(session));
        } catch (caught) {
          return fromError(caught);
        }
      });
    }
    if (action === "decision" && method === "POST") {
      const input = await body(request, (value) => humanDecisionInputSchema.parse(value));
      if (input instanceof NextResponse) return input;
      if (!session.report_raw)
        return error(409, "no_report", "Generate the report before recording a decision.");
      session.human_decision = {
        ...input,
        reviewer_id: user.user_id,
        recorded_at: new Date().toISOString(),
      };
      save(session);
      audit("human_decision", `${input.decision} by ${user.display_name}`, session.session_id);
      return json(session.human_decision);
    }
  }

  if (resource === "audit" && method === "GET") {
    const filter = url.searchParams.get("session_id");
    const items = db().audit.filter((event) => !filter || event.session_id === filter);
    return json({ items, total: items.length });
  }

  return error(404, "not_found", "Unknown route.");
}
