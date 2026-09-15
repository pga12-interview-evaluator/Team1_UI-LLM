import { z } from "zod";
import { request, upload, newIdempotencyKey } from "./client";
import {
  candidateSessionViewSchema,
  mediaChunkAckSchema,
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

  eventsUrl(token: string): string {
    return `${process.env.NEXT_PUBLIC_API_MODE === "real" ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1") : "/api/mock"}/candidate/sessions/${encodeURIComponent(token)}/events`;
  },
};

export const emptySchema = z.undefined();
