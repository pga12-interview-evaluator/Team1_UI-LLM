import { NextResponse } from "next/server";
import { practiceInputSchema, resumeError } from "@/lib/api/schemas/setup";
import {
  answerPayloadSchema,
  candidateRequestPayloadSchema,
  consentPayloadSchema,
  type CandidateSessionView,
} from "@/lib/api/schemas/candidate";
import {
  humanDecisionInputSchema,
  requisitionInputSchema,
  type Requisition,
  type SessionDetail,
  type SessionSummary,
} from "@/lib/api/schemas/console";
import { authenticate, issueCookie, readCookie } from "./auth";
import * as engine from "./engine/interviewer";
import { buildReport } from "./engine/report";
import { blueprintFor, newSession, seed } from "./seed";
import { audit, db, subscribe, type MockSession } from "./store";

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

async function body<T>(request: Request, parse: (input: unknown) => T): Promise<T | NextResponse> {
  try {
    return parse(await request.json());
  } catch (caught) {
    return error(400, "invalid_body", "Request body failed validation.", String(caught));
  }
}

function sessionByToken(token: string): MockSession | null {
  seed();
  const id = db().tokens.get(token);
  return id ? (db().sessions.get(id) ?? null) : null;
}

/** The ONLY projection that leaves the candidate channel. Built explicitly from an allowlist. */
export function candidateView(session: MockSession): CandidateSessionView {
  engine.settle(session);
  const requisition = db().requisitions.get(session.requisition_id);
  const elapsed = session.started_at
    ? Math.max(0, (Date.now() - new Date(session.started_at).getTime()) / 1000)
    : 0;
  return {
    session_id: session.session_id,
    status: session.status,
    interview_language: session.interview_language,
    interview_modality: requisition?.interview_modality ?? "both",
    job_title: requisition?.job_title ?? "",
    company_display_name: "Interviewly Studio",
    duration_minutes: requisition?.duration_minutes ?? 45,
    opening_disclosure:
      session.status === "awaiting_consent" || session.status === "device_check"
        ? null
        : engine.disclosureText(session),
    consent: session.consent,
    accommodations_applied: [...session.accommodations],
    current_turn: session.current_turn,
    elapsed_seconds: Math.round(elapsed),
    interview_purpose: "mock_practice",
  };
}

/* ---------------- candidate channel ---------------- */

export async function candidateRoute(request: Request, segments: string[]): Promise<NextResponse> {
  if (segments.length === 2 && segments[1] === "sessions" && request.method === "GET") {
    seed();
    const items = Array.from(db().sessions.values())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((session) => ({
        token: session.invite_token,
        job_title: db().requisitions.get(session.requisition_id)?.job_title ?? "Demo interview",
        candidate_label: session.candidate_label,
        status: session.status,
        created_at: session.created_at,
        ended_at: session.ended_at,
        questions_answered: session.evaluations.length,
      }));
    return json({ items });
  }
  if (segments.length === 2 && segments[1] === "sessions" && request.method === "POST") {
    seed();
    // Exercises upload + session creation; this mock does not parse the resume or call Gemini.
    const form = await request.formData();
    const resume = form.get("resume");
    if (!(resume instanceof File))
      return error(400, "resume_required", "Upload your resume to continue.");
    const problem = resumeError(resume);
    if (problem) return error(400, "invalid_resume", problem);
    const parsed = practiceInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return error(400, "invalid_setup", "Check your interview details.");
    const base = db().requisitions.get("REQ_demo_fpa")!;
    const input = parsed.data;
    const requisition: Requisition = {
      ...base,
      ...input,
      requisition_id: `REQ_${crypto.randomUUID()}`,
      interview_purpose: "mock_practice",
      session_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db().requisitions.set(requisition.requisition_id, requisition);
    const created = newSession(requisition, input.candidate_name, input.interview_language);
    return json(
      { session_id: created.session_id, invite_token: created.invite_token, mode: "mock" },
      201,
    );
  }
  // /candidate/sessions/{token}[/action]
  const [, , token, action] = segments;
  if (!token) return error(404, "not_found", "Unknown route.");
  const session = sessionByToken(token);
  if (!session) return error(404, "not_found", "This interview link is not valid or has expired.");
  const method = request.method.toUpperCase();

  if (!action && method === "GET") return json(candidateView(session));

  if (action === "events" && method === "GET") return eventsStream(session);
  if (action === "review" && method === "GET") {
    // Demo: a fixed, clearly-labelled review so the page can be exercised without a model.
    if (!["closed", "escalated", "reported"].includes(session.status))
      return error(409, "not_finished", "Your review is ready once the interview has ended.");
    return json(demoReview(session.session_id));
  }

  if (method !== "POST") return error(405, "method_not_allowed", "Method not allowed.");

  switch (action) {
    case "consent": {
      const payload = await body(request, (input) => consentPayloadSchema.parse(input));
      if (payload instanceof NextResponse) return payload;
      if (session.status !== "awaiting_consent") return json(candidateView(session));
      engine.consentGiven(session, { ...payload, ai_interview_notice_ack: true });
      return json(candidateView(session));
    }
    case "device-ready": {
      const payload = await body(
        request,
        (input) => input as { camera: boolean; microphone: boolean },
      );
      if (payload instanceof NextResponse) return payload;
      if (session.status !== "device_check") return json(candidateView(session));
      engine.deviceReady(session, { camera: !!payload.camera, microphone: !!payload.microphone });
      return json(candidateView(session));
    }
    case "start": {
      engine.start(session);
      return json(candidateView(session));
    }
    case "answers": {
      const payload = await body(request, (input) => answerPayloadSchema.parse(input));
      if (payload instanceof NextResponse) return payload;
      engine.settle(session);
      if (session.current_turn && payload.turn_index !== session.current_turn.turn_index) {
        // Idempotent: a stale or duplicate submission returns the current view without re-applying.
        return json(candidateView(session));
      }
      engine.answer(
        session,
        payload.text || (payload.media_ref ? "[voice answer — transcript pending]" : ""),
      );
      return json(candidateView(session));
    }
    case "requests": {
      const payload = await body(request, (input) => candidateRequestPayloadSchema.parse(input));
      if (payload instanceof NextResponse) return payload;
      if (payload.type === "adjustment") engine.adjustment(session, payload.code);
      else engine.request(session, payload.type);
      return json(candidateView(session));
    }
    case "frames":
      return new NextResponse(null, { status: 204 }); // mock mode analyses nothing
    case "media": {
      const form = await request.formData();
      const chunk = form.get("chunk");
      const size = chunk instanceof Blob ? chunk.size : 0;
      return json({
        media_ref: `media_${session.session_id}_${form.get("turn_index")}`,
        received_bytes: size,
      });
    }
    default:
      return error(404, "not_found", "Unknown route.");
  }
}

function eventsStream(session: MockSession): NextResponse {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let settleTimer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      send({ type: "status", session: candidateView(session) });
      unsubscribe = subscribe(session.session_id, (updated) =>
        send({ type: "turn", session: candidateView(updated) }),
      );
      heartbeat = setInterval(
        () => send({ type: "heartbeat", at: new Date().toISOString() }),
        15_000,
      );
      // Release simulated evaluation delays even when nobody polls.
      settleTimer = setInterval(() => engine.settle(session), 500);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (settleTimer) clearInterval(settleTimer);
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
    .map((part) => part.trim())
    .find((part) => part.startsWith("console_session="));
  return readCookie(cookie?.split("=")[1]);
}

function summary(session: MockSession, requisition: Requisition | undefined): SessionSummary {
  engine.settle(session);
  const statusMap: Record<MockSession["status"], SessionSummary["status"]> = {
    awaiting_consent: "invited",
    device_check: "consented",
    ready: "consented",
    disclosed: "active",
    active: "active",
    evaluating: "active",
    paused: "paused",
    candidate_questions: "candidate_questions",
    closed: session.report ? "reported" : "closed",
    escalated: "escalated",
  };
  const started = session.started_at ? new Date(session.started_at).getTime() : null;
  const ended = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  return {
    session_id: session.session_id,
    requisition_id: session.requisition_id,
    job_title: requisition?.job_title ?? "",
    candidate_label: session.candidate_label,
    status: statusMap[session.status],
    pressure_level: requisition?.pressure_level ?? "standard",
    interview_purpose: requisition?.interview_purpose ?? "hiring",
    invite_token: session.status === "awaiting_consent" ? session.invite_token : null,
    started_at: session.started_at,
    ended_at: session.ended_at,
    elapsed_minutes: started ? Number(((ended - started) / 60_000).toFixed(1)) : 0,
    questions_asked: new Set(session.evaluations.map((e) => e.question_id)).size,
    questions_planned: requisition?.blueprint?.interview_plan.length ?? 0,
    probes_used: session.probes_total,
    escalation_reason: session.escalation_reason,
    accommodation_applied: session.accommodations.length > 0,
    human_decision: session.human_decision?.decision ?? null,
  };
}

function detail(session: MockSession, requisition: Requisition | undefined): SessionDetail {
  return {
    summary: summary(session, requisition),
    transcript: session.transcript,
    evaluations: session.evaluations,
    budget_audit: session.budget_audit,
    accommodations_applied: [...session.accommodations],
    report: session.report,
    human_decision: session.human_decision,
    version_bundle: {
      prompt_versions: "blueprint 2.1.0 · interviewer 2.1.1 · evaluator 2.1.1 · final 2.1.0",
      contracts_version: "2.1.1",
      model_id: "mock-engine",
      signal_schema_version: "behavioral_signals/1.0",
      policy_version: "pl-2026-09",
    },
  };
}

export async function consoleRoute(request: Request, segments: string[]): Promise<NextResponse> {
  seed();
  const [, resource, id, action] = segments;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if (resource === "dev-login" && method === "POST") {
    if (process.env.NODE_ENV !== "development")
      return error(404, "not_found", "Development access is disabled.");
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin)
      return error(403, "invalid_origin", "Open the workspace directly to continue.");
    const user = { user_id: "local_developer", display_name: "Developer", role: "admin" as const };
    const cookie = issueCookie(user);
    const response = json(user);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  }

  if (resource === "login" && method === "POST") {
    const payload = await body(request, (input) => input as { email: string; password: string });
    if (payload instanceof NextResponse) return payload;
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

  if (resource === "requisitions") {
    if (!id) {
      if (method === "GET") {
        const items = Array.from(db().requisitions.values()).sort((a, b) =>
          b.updated_at.localeCompare(a.updated_at),
        );
        return json({ items, total: items.length });
      }
      if (method === "POST") {
        const input = await body(request, (value) => requisitionInputSchema.parse(value));
        if (input instanceof NextResponse) return input;
        const now = new Date().toISOString();
        const requisition: Requisition = {
          ...input,
          requisition_id: `REQ_${Math.random().toString(36).slice(2, 8)}`,
          status: "draft",
          created_at: now,
          updated_at: now,
          blueprint: null,
          session_count: 0,
        };
        db().requisitions.set(requisition.requisition_id, requisition);
        return json(requisition, 201);
      }
    }
    const requisition = id ? db().requisitions.get(id) : undefined;
    if (!requisition) return error(404, "not_found", "Requisition not found.");
    if (!action && method === "GET") return json(requisition);
    if (!action && method === "PUT") {
      const input = await body(request, (value) => requisitionInputSchema.parse(value));
      if (input instanceof NextResponse) return input;
      Object.assign(requisition, input, {
        updated_at: new Date().toISOString(),
        status: requisition.blueprint ? "blueprint_review" : "draft",
      });
      return json(requisition);
    }
    if (action === "blueprint" && method === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      requisition.blueprint = blueprintFor(requisition);
      requisition.status = "blueprint_review";
      requisition.updated_at = new Date().toISOString();
      return json(requisition);
    }
    if (action === "freeze" && method === "POST") {
      if (!requisition.blueprint?.validation.passed)
        return error(409, "blueprint_invalid", "Blueprint must validate before freezing.");
      requisition.status = "frozen";
      requisition.updated_at = new Date().toISOString();
      return json(requisition);
    }
    if (action === "invites" && method === "POST") {
      if (requisition.status !== "frozen")
        return error(409, "not_frozen", "Freeze the blueprint before inviting candidates.");
      const payload = await body(
        request,
        (value) => value as { candidate_label: string; interview_language?: string },
      );
      if (payload instanceof NextResponse) return payload;
      const session = newSession(
        requisition,
        payload.candidate_label || "Candidate",
        payload.interview_language || requisition.interview_language,
      );
      return json(
        {
          session_id: session.session_id,
          invite_token: session.invite_token,
          invite_url: `${url.origin}/i/${session.invite_token}`,
        },
        201,
      );
    }
  }

  if (resource === "sessions") {
    if (!id && method === "GET") {
      const filterReq = url.searchParams.get("requisition_id");
      const filterStatus = url.searchParams.get("status");
      const items = Array.from(db().sessions.values())
        .map((session) => summary(session, db().requisitions.get(session.requisition_id)))
        .filter(
          (s) =>
            (!filterReq || s.requisition_id === filterReq) &&
            (!filterStatus || s.status === filterStatus),
        )
        .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
      return json({ items, total: items.length });
    }
    const session = id ? db().sessions.get(id) : undefined;
    if (!session) return error(404, "not_found", "Session not found.");
    const requisition = db().requisitions.get(session.requisition_id);
    if (!action && method === "GET") return json(detail(session, requisition));
    if (action === "report" && method === "POST") {
      if (session.status !== "closed" && session.status !== "escalated")
        return error(
          409,
          "session_open",
          "The report can be generated only after the session is closed.",
        );
      if (!requisition) return error(404, "not_found", "Requisition not found.");
      await new Promise((resolve) => setTimeout(resolve, 900));
      session.report = buildReport(session, requisition);
      return json(session.report);
    }
    if (action === "decision" && method === "POST") {
      const input = await body(request, (value) => humanDecisionInputSchema.parse(value));
      if (input instanceof NextResponse) return input;
      if (!session.report)
        return error(409, "no_report", "Generate the report before recording a decision.");
      session.human_decision = {
        ...input,
        reviewer_id: user.user_id,
        recorded_at: new Date().toISOString(),
      };
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

function demoReview(sessionId: string) {
  const answer = {
    answer_id: "A_Q2_0",
    question_id: "Q2",
    question: "Walk me through the monthly close you ran and one number you moved.",
    kind: "main question",
    answer:
      "I owned the accruals step of the close. I built a tracker that cut the close from nine to five days over three months.",
    scores: [
      {
        competency_id: "C1",
        name: "Month-end close and accruals",
        score: 3,
        evidence_grade: "specific",
        evidence: ["owned accruals step", "nine to five days over three months"],
        missing: ["how the baseline of nine days was measured"],
      },
    ],
    watch_outs: [
      {
        label: "Gave a number without its baseline, window or source",
        quote: "nine to five days",
        severity: 1,
      },
    ],
    good_moves: [
      {
        label: "Honestly narrowed the claim to what you actually did",
        quote: "I owned the accruals step",
      },
    ],
    follow_up_asked: "How was the nine-day baseline measured, and over which months?",
    speech: {
      words: 24,
      duration_sec: 14,
      words_per_minute: 103,
      filler_count: 0,
      fillers_per_100_words: 0,
      top_fillers: [],
    },
    presence: null,
  };
  return {
    session_id: sessionId,
    job_title: "FP&A Analyst",
    seniority: "mid",
    started_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    ended_at: new Date().toISOString(),
    duration_minutes: 12,
    questions_answered: 1,
    report: {
      overall_score: 3.0,
      recommendation: "positive_signal_with_follow_up",
      headline: "Good, with a few claims still to back up (demo data)",
      rationale: "Demo review: fixed content, not generated from your answers.",
      competencies: [
        {
          competency_id: "C1",
          name: "Month-end close and accruals",
          weight: 35,
          score: 3,
          confidence: "medium",
          demonstrated_up_to: "L2",
          bar: "L2",
          gap: null,
        },
      ],
      strengths: ["You gave a first-person, specific example with a before and after."],
      gaps: ["The nine-day baseline was not sourced."],
      practice_suggestions: ["Bring the before-number and its source for any result you mention."],
      unverified_claims: [],
    },
    report_error: null,
    answers: [answer],
    speech_summary: {
      total_words: 24,
      average_words_per_minute: 103,
      fillers_per_100_words: 0,
      notes: ["Average pace 103 words/min — on the slow side; aim for 120–160."],
    },
    presence_summary: null,
    presence_status: "no_data",
  };
}
