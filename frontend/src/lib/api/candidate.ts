import { z } from "zod";
import { request, upload, uploadOptional, newIdempotencyKey } from "./client";
import { practiceReviewSchema, practiceSessionListSchema } from "./schemas/review";
import {
  candidateSessionViewSchema,
  framesAckSchema,
  mediaChunkAckSchema,
  type FramesAck,
  type AnswerPayload,
  type CandidateRequestPayload,
  type CandidateSessionView,
  type ConsentPayload,
} from "./schemas/candidate";

/** Candidate channel. Every call is scoped by the invite token; the browser never sees a session id it did not receive from here. */
export const candidateApi = {
  getSession(token: string, signal?: AbortSignal): Promise<CandidateSessionView> {
    return request(`/candidate/sessions/${encodeURIComponent(token)}`, {
      schema: candidateSessionViewSchema,
      signal,
    });
  },

  submitConsent(token: string, payload: ConsentPayload): Promise<CandidateSessionView> {
    return request(`/candidate/sessions/${encodeURIComponent(token)}/consent`, {
      method: "POST",
      body: payload,
      schema: candidateSessionViewSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },

  /** Device check passed (or skipped for text modality). Moves the session to `ready`. */
  markDeviceReady(
    token: string,
    payload: { camera: boolean; microphone: boolean },
  ): Promise<CandidateSessionView> {
    return request(`/candidate/sessions/${encodeURIComponent(token)}/device-ready`, {
      method: "POST",
      body: payload,
      schema: candidateSessionViewSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },

  /** Candidate acknowledged the disclosure. Backend sets candidate_rights_disclosed and asks the first question. */
  start(token: string): Promise<CandidateSessionView> {
    return request(`/candidate/sessions/${encodeURIComponent(token)}/start`, {
      method: "POST",
      schema: candidateSessionViewSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },

  submitAnswer(
    token: string,
    payload: AnswerPayload,
    idempotencyKey: string,
  ): Promise<CandidateSessionView> {
    return request(`/candidate/sessions/${encodeURIComponent(token)}/answers`, {
      method: "POST",
      body: payload,
      schema: candidateSessionViewSchema,
      idempotencyKey,
    });
  },

  sendRequest(token: string, payload: CandidateRequestPayload): Promise<CandidateSessionView> {
    return request(`/candidate/sessions/${encodeURIComponent(token)}/requests`, {
      method: "POST",
      body: payload,
      schema: candidateSessionViewSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },

  uploadMediaChunk(
    token: string,
    turnIndex: number,
    blob: Blob,
    sequence: number,
    signal?: AbortSignal,
  ) {
    const form = new FormData();
    form.set("turn_index", String(turnIndex));
    form.set("sequence", String(sequence));
    form.set("chunk", blob, `chunk-${sequence}.webm`);
    return upload(
      `/candidate/sessions/${encodeURIComponent(token)}/media`,
      form,
      mediaChunkAckSchema,
      signal,
    );
  },

  /**
   * Camera frames for the body-language service, one batch per second while answering.
   * Resolves "disabled" when the backend is not accepting frames (consent, camera, accommodation).
   */
  async pushFrames(
    token: string,
    turnIndex: number,
    frames: { t_ms: number; blob: Blob }[],
  ): Promise<FramesAck | "disabled"> {
    const form = new FormData();
    form.set("turn_index", String(turnIndex));
    for (const frame of frames) form.append("frames", frame.blob, `${frame.t_ms}.jpg`);
    const ack = await uploadOptional(
      `/candidate/sessions/${encodeURIComponent(token)}/frames`,
      form,
      framesAckSchema,
    );
    return ack ?? "disabled";
  },

  /** Practice interviews known to this server (no accounts in practice mode). */
  listPracticeSessions(signal?: AbortSignal) {
    return request("/candidate/sessions", { schema: practiceSessionListSchema, signal });
  },

  /** Post-interview practice review (mock-practice sessions only; 409 until the session has ended). */
  getReview(token: string, signal?: AbortSignal) {
    return request(`/candidate/sessions/${encodeURIComponent(token)}/review`, {
      schema: practiceReviewSchema,
      signal,
      retries: 0,
    });
  },

  eventsUrl(token: string): string {
    return `${process.env.NEXT_PUBLIC_API_MODE === "real" ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1") : "/api/mock"}/candidate/sessions/${encodeURIComponent(token)}/events`;
  },
};

export const emptySchema = z.undefined();
