"use client";

import { create } from "zustand";
import type { AccommodationCode, CandidateSessionView } from "@/lib/api/schemas/candidate";
import { initialUiState, reduce, type UiEvent, type UiState } from "../machine/interviewMachine";

export type AnswerModality = "voice" | "text";

interface InterviewStore {
  token: string | null;
  ui: UiState;
  view: CandidateSessionView | null;
  modality: AnswerModality;
  draft: string;
  /** Idempotency key for the current answer submission; reused on retry so the server never double-applies. */
  answerKey: string | null;
  answerStartedAt: number | null;
  connection: "connecting" | "live" | "polling" | "offline";

  init(token: string): void;
  dispatch(event: UiEvent): void;
  setModality(modality: AnswerModality): void;
  setDraft(draft: string): void;
  beginAnswer(key: string): void;
  clearAnswer(): void;
  setConnection(connection: InterviewStore["connection"]): void;
}

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  token: null,
  ui: initialUiState,
  view: null,
  modality: "voice",
  draft: "",
  answerKey: null,
  answerStartedAt: null,
  connection: "connecting",

  init(token) {
    if (get().token === token) return;
    set({
      token,
      ui: initialUiState,
      view: null,
      draft: "",
      answerKey: null,
      answerStartedAt: null,
    });
  },

  dispatch(event) {
    const ui = reduce(get().ui, event);
    const view = "view" in event ? event.view : get().view;
    const next: Partial<InterviewStore> = { ui, view };
    if ("view" in event) {
      const applied = event.view.accommodations_applied;
      next.modality = deriveModality(event.view.interview_modality, applied, get().modality);
      // A new turn resets the draft and the answer clock.
      const previousTurn = get().view?.current_turn?.turn_index;
      if (event.view.current_turn && event.view.current_turn.turn_index !== previousTurn) {
        next.draft = "";
        next.answerKey = null;
        next.answerStartedAt = Date.now();
      }
    }
    set(next);
  },

  setModality(modality) {
    set({ modality });
  },
  setDraft(draft) {
    set({ draft });
  },
  beginAnswer(key) {
    set({ answerKey: key });
  },
  clearAnswer() {
    set({ draft: "", answerKey: null });
  },
  setConnection(connection) {
    set({ connection });
  },
}));

function deriveModality(
  sessionModality: CandidateSessionView["interview_modality"],
  applied: AccommodationCode[],
  current: AnswerModality,
): AnswerModality {
  if (applied.includes("text_modality") || sessionModality === "text") return "text";
  if (applied.includes("voice_modality") || sessionModality === "voice") return "voice";
  return current;
}
