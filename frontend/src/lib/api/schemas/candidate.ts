import { z } from "zod";

/**
 * Candidate-facing contracts. Mirrors prompts_v2/00_shared_contracts.md §17 (candidate_turn_dto)
 * and the session/consent surface the BFF exposes to the candidate browser.
 *
 * The DTO is `.strict()`: any extra key (a leaked hidden field) fails parsing and the UI
 * refuses to render it. This is the client-side half of the visibility whitelist.
 */

export const dtoTurnTypeSchema = z.enum([
  "main_question",
  "follow_up",
  "candidate_questions",
  "closing",
]);
export type DtoTurnType = z.infer<typeof dtoTurnTypeSchema>;

export const phaseLabelSchema = z.enum(["interview", "your_questions", "closing"]);
export type PhaseLabel = z.infer<typeof phaseLabelSchema>;

export const candidateTurnDtoSchema = z
  .object({
    turn_index: z.number().int().nonnegative(),
    turn_type: dtoTurnTypeSchema,
    candidate_message: z.string().min(1),
    requires_answer: z.boolean(),
    max_answer_seconds: z.number().int().positive(),
    can_request_clarification: z.boolean(),
    phase_label: phaseLabelSchema,
  })
  .strict();
export type CandidateTurnDto = z.infer<typeof candidateTurnDtoSchema>;

export const candidateSessionStatusSchema = z.enum([
  "awaiting_consent",
  "device_check",
  "ready", // consent done, disclosure not yet shown
  "disclosed", // disclosure shown, first question not yet asked
  "active",
  "paused",
  "evaluating",
  "candidate_questions",
  "closed",
  "escalated",
]);
export type CandidateSessionStatus = z.infer<typeof candidateSessionStatusSchema>;

export const interviewModalitySchema = z.enum(["voice", "text", "both"]);
export type InterviewModality = z.infer<typeof interviewModalitySchema>;

export const accommodationCodeSchema = z.enum([
  "extended_answer_time",
  "text_modality",
  "voice_modality",
  "read_aloud",
  "captions",
  "breaks",
  "camera_off",
  "no_behavioral_analysis",
  "high_contrast",
  "human_interviewer",
]);
export type AccommodationCode = z.infer<typeof accommodationCodeSchema>;

export const candidateSessionViewSchema = z
  .object({
    session_id: z.string().min(1),
    status: candidateSessionStatusSchema,
    interview_language: z.string().min(2),
    interview_modality: interviewModalitySchema,
    job_title: z.string(),
    company_display_name: z.string(),
    duration_minutes: z.number().int().positive(),
    /** Rendered by the backend from scripts.opening_disclosure, already in interview_language. */
    opening_disclosure: z.string().nullable(),
    consent: z.object({
      ai_interview_notice_ack: z.boolean(),
      recording_consent: z.boolean(),
      behavioral_analysis_consent: z.boolean(),
      notice_version: z.string(),
    }),
    accommodations_applied: z.array(accommodationCodeSchema),
    current_turn: candidateTurnDtoSchema.nullable(),
    /** Server-authoritative elapsed clock; the client never computes time modes. */
    elapsed_seconds: z.number().nonnegative(),
  })
  .strict();
export type CandidateSessionView = z.infer<typeof candidateSessionViewSchema>;

export const consentPayloadSchema = z.object({
  ai_interview_notice_ack: z.literal(true),
  recording_consent: z.boolean(),
  behavioral_analysis_consent: z.boolean(),
  notice_version: z.string().min(1),
});
export type ConsentPayload = z.infer<typeof consentPayloadSchema>;

export const answerPayloadSchema = z.object({
  turn_index: z.number().int().nonnegative(),
  text: z.string().max(20_000),
  /** Set when the answer came from a media upload; the BFF pairs it with the ASR transcript. */
  media_ref: z.string().nullable(),
  client_elapsed_ms: z.number().int().nonnegative(),
  auto_submitted: z.boolean(),
});
export type AnswerPayload = z.infer<typeof answerPayloadSchema>;

export const candidateRequestTypeSchema = z.enum([
  "repeat",
  "rephrase",
  "break",
  "resume",
  "adjustment",
  "stop",
]);
export type CandidateRequestType = z.infer<typeof candidateRequestTypeSchema>;

export const candidateRequestPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("repeat") }),
  z.object({ type: z.literal("rephrase") }),
  z.object({ type: z.literal("break") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("adjustment"), code: accommodationCodeSchema }),
  z.object({ type: z.literal("stop") }),
]);
export type CandidateRequestPayload = z.infer<typeof candidateRequestPayloadSchema>;

/** Server-sent event envelope on GET /sessions/{id}/events. */
export const sessionEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn"), session: candidateSessionViewSchema }),
  z.object({ type: z.literal("status"), session: candidateSessionViewSchema }),
  z.object({ type: z.literal("heartbeat"), at: z.string() }),
]);
export type SessionEvent = z.infer<typeof sessionEventSchema>;

export const mediaChunkAckSchema = z.object({
  media_ref: z.string(),
  received_bytes: z.number().int().nonnegative(),
});
export type MediaChunkAck = z.infer<typeof mediaChunkAckSchema>;
