import type { CandidateSessionView, CandidateTurnDto } from "@/lib/api/schemas/candidate";

/**
 * Candidate UI state machine (guide §14). The server view is authoritative for phase and turn;
 * this machine only adds the client-side transitions the server cannot see (an answer in
 * flight, a request in flight, a load error) and guarantees exhaustive rendering.
 */
export type UiState =
  | { kind: "loading" }
  | { kind: "error"; message: string; retryable: boolean; previous: UiState | null }
  | { kind: "consent"; view: CandidateSessionView }
  | { kind: "device_check"; view: CandidateSessionView }
  | { kind: "disclosure"; view: CandidateSessionView }
  | { kind: "asking"; view: CandidateSessionView; turn: CandidateTurnDto }
  | { kind: "submitting"; view: CandidateSessionView; turn: CandidateTurnDto | null }
  | { kind: "requesting"; view: CandidateSessionView; turn: CandidateTurnDto | null }
  | { kind: "paused"; view: CandidateSessionView; turn: CandidateTurnDto | null }
  | { kind: "candidate_questions"; view: CandidateSessionView; turn: CandidateTurnDto }
  | { kind: "closing"; view: CandidateSessionView; turn: CandidateTurnDto | null }
  | { kind: "escalated"; view: CandidateSessionView };

export type UiEvent =
  | { type: "LOAD_OK"; view: CandidateSessionView }
  | { type: "LOAD_FAIL"; message: string; retryable: boolean }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_OK"; view: CandidateSessionView }
  | { type: "SUBMIT_FAIL"; message: string; retryable: boolean }
  | { type: "REQUEST_START" }
  | { type: "REQUEST_OK"; view: CandidateSessionView }
  | { type: "REQUEST_FAIL"; message: string; retryable: boolean }
  | { type: "SERVER_PUSH"; view: CandidateSessionView }
  | { type: "RETRY" };

export const initialUiState: UiState = { kind: "loading" };

/** Pure projection from the authoritative server view to a UI state. */
export function stateFromView(view: CandidateSessionView): UiState {
  switch (view.status) {
    case "awaiting_consent":
      return { kind: "consent", view };
    case "device_check":
      return { kind: "device_check", view };
    case "ready":
      return { kind: "disclosure", view };
    case "paused":
      return { kind: "paused", view, turn: view.current_turn };
    case "evaluating":
      return { kind: "submitting", view, turn: view.current_turn };
    case "escalated":
      return { kind: "escalated", view };
    case "closed":
      return { kind: "closing", view, turn: view.current_turn };
    case "disclosed":
    case "active":
    case "candidate_questions": {
      const turn = view.current_turn;
      if (!turn) return { kind: "submitting", view, turn: null };
      if (turn.turn_type === "closing") return { kind: "closing", view, turn };
      if (turn.turn_type === "candidate_questions" || turn.phase_label === "your_questions") {
        return { kind: "candidate_questions", view, turn };
      }
      return { kind: "asking", view, turn };
    }
    default: {
      const exhaustive: never = view.status;
      return exhaustive;
    }
  }
}

function currentView(state: UiState): CandidateSessionView | null {
  return "view" in state
    ? state.view
    : state.kind === "error" && state.previous && "view" in state.previous
      ? state.previous.view
      : null;
}

function currentTurn(state: UiState): CandidateTurnDto | null {
  if ("turn" in state) return state.turn;
  const view = currentView(state);
  return view?.current_turn ?? null;
}

export function reduce(state: UiState, event: UiEvent): UiState {
  switch (event.type) {
    case "LOAD_OK":
    case "SUBMIT_OK":
    case "REQUEST_OK":
    case "SERVER_PUSH": {
      // A server push while an answer is in flight must not un-block the composer prematurely:
      // the in-flight call resolves with the newer view anyway.
      if (
        event.type === "SERVER_PUSH" &&
        (state.kind === "submitting" || state.kind === "requesting")
      ) {
        const projected = stateFromView(event.view);
        const turnChanged =
          projected.kind === "asking" &&
          projected.turn.turn_index !== currentTurn(state)?.turn_index;
        return turnChanged ||
          projected.kind === "closing" ||
          projected.kind === "escalated" ||
          projected.kind === "paused"
          ? projected
          : state;
      }
      return stateFromView(event.view);
    }
    case "LOAD_FAIL":
    case "SUBMIT_FAIL":
    case "REQUEST_FAIL":
      return {
        kind: "error",
        message: event.message,
        retryable: event.retryable,
        previous: state.kind === "error" ? state.previous : state,
      };
    case "SUBMIT_START": {
      const view = currentView(state);
      if (!view) return state;
      return { kind: "submitting", view, turn: currentTurn(state) };
    }
    case "REQUEST_START": {
      const view = currentView(state);
      if (!view) return state;
      return { kind: "requesting", view, turn: currentTurn(state) };
    }
    case "RETRY": {
      if (state.kind !== "error") return state;
      return state.previous ?? initialUiState;
    }
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** Whether the candidate can act (answer or send a request) in this state. */
export function canInteract(state: UiState): boolean {
  return state.kind === "asking" || state.kind === "candidate_questions" || state.kind === "paused";
}

/** Rights bar is visible from disclosure onward until the session is finished. */
export function rightsVisible(state: UiState): boolean {
  return (
    state.kind === "asking" ||
    state.kind === "submitting" ||
    state.kind === "requesting" ||
    state.kind === "paused" ||
    state.kind === "candidate_questions"
  );
}
