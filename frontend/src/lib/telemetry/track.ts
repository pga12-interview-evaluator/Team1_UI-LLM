/**
 * Minimal telemetry facade. Never sends candidate answer text or hidden fields.
 * Wire a provider in `installTelemetry` (e.g. OpenTelemetry web SDK) without touching call sites.
 */
export type TelemetryEvent =
  | { name: "candidate.consent_submitted"; behavioral: boolean; recording: boolean }
  | { name: "candidate.turn_rendered"; turn_type: string; phase_label: string }
  | {
      name: "candidate.answer_submitted";
      auto: boolean;
      elapsed_ms: number;
      modality: "voice" | "text";
    }
  | { name: "candidate.request"; type: string }
  | { name: "candidate.media_error"; reason: string }
  | { name: "candidate.contract_violation"; path: string }
  | { name: "console.decision_recorded"; decision: string }
  | { name: "ui.error_boundary"; scope: string };

type Sink = (event: TelemetryEvent & { at: string }) => void;

let sink: Sink | null = null;

export function installTelemetry(nextSink: Sink): void {
  sink = nextSink;
}

export function track(event: TelemetryEvent): void {
  const enriched = { ...event, at: new Date().toISOString() };
  if (sink) {
    sink(enriched);
    return;
  }
  if (process.env.NODE_ENV === "development") {
    console.debug("[telemetry]", enriched);
  }
}
