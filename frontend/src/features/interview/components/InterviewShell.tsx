"use client";

import { useEffect, useMemo, useRef } from "react";
import { Skeleton, StepIndicator } from "@/components/ui";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { track } from "@/lib/telemetry/track";
import { useMediaCapture } from "../hooks/useMediaCapture";
import { useSessionSync } from "../hooks/useSessionSync";
import { rightsVisible, type UiState } from "../machine/interviewMachine";
import { useInterviewStore } from "../store/useInterviewStore";
import { AnswerComposer } from "./AnswerComposer";
import { ConsentStep } from "./ConsentStep";
import { DeviceCheck } from "./DeviceCheck";
import { DisclosureStep } from "./DisclosureStep";
import { ClosingScreen, ErrorScreen, EscalatedScreen, PausedScreen } from "./EndScreens";
import { QuestionCard } from "./QuestionCard";
import { RightsBar } from "./RightsBar";
import { SessionChrome } from "./SessionChrome";
import { StudioMedia } from "./StudioMedia";
import { completeSession } from "@/features/workspace/history";

export function InterviewShell({ token }: { token: string }) {
  useSessionSync(token);
  const ui = useInterviewStore((s) => s.ui);
  const view = useInterviewStore((s) => s.view);
  const dispatch = useInterviewStore((s) => s.dispatch);
  const modality = useInterviewStore((s) => s.modality);

  const applied = useMemo(() => view?.accommodations_applied ?? [], [view?.accommodations_applied]);
  const inInterview = rightsVisible(ui);
  const wantCamera =
    inInterview &&
    !!view?.consent.recording_consent &&
    !applied.includes("camera_off") &&
    !applied.includes("text_modality");
  const wantMic =
    inInterview &&
    (modality === "voice" || !!view?.consent.recording_consent) &&
    view?.interview_modality !== "text" &&
    !applied.includes("text_modality");
  const uploadEnabled = !!view?.consent.recording_consent;
  const media = useMediaCapture({ token, wantCamera, wantMicrophone: wantMic, uploadEnabled });
  // 00 §12.2 off switches, mirrored client-side so no frame leaves the browser when capture is off.
  const behavioralCapture =
    wantCamera &&
    !!view?.consent.behavioral_analysis_consent &&
    applied.length === 0 &&
    media.camera === "granted";
  const stopAnswerRecording = media.stopRecording;
  const acquiredFor = useRef<string>("");
  useEffect(() => {
    if (ui.kind === "paused") void stopAnswerRecording().catch(() => {});
  }, [ui.kind, stopAnswerRecording]);

  useEffect(() => {
    const key = `${wantCamera}-${wantMic}`;
    if (!inInterview || acquiredFor.current === key || (!wantCamera && !wantMic)) return;
    acquiredFor.current = key;
    void media.acquire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inInterview, wantCamera, wantMic]);

  useEffect(() => {
    if (applied.includes("camera_off") && media.stream?.getVideoTracks().length) media.stopVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied.join(","), media.stream]);

  useEffect(() => {
    if (ui.kind === "closing" || ui.kind === "escalated") completeSession(token);
    if ((ui.kind === "closing" || ui.kind === "escalated") && media.stream) media.release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.kind]);

  useEffect(() => {
    if (ui.kind === "asking" || ui.kind === "candidate_questions") {
      track({
        name: "candidate.turn_rendered",
        turn_type: ui.turn.turn_type,
        phase_label: ui.turn.phase_label,
      });
    }
  }, [ui]);

  // Accommodation-driven document attributes (high contrast, larger text).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.contrast = applied.includes("high_contrast") ? "high" : "";
    root.dataset.textsize = applied.includes("high_contrast") ? "large" : "";
    return () => {
      delete root.dataset.contrast;
      delete root.dataset.textsize;
    };
  }, [applied]);

  const phaseLabel = useMemo(() => ("turn" in ui && ui.turn ? ui.turn.phase_label : null), [ui]);
  const language = view?.interview_language ?? "en";

  return (
    <I18nProvider languageTag={language}>
      <SessionChrome
        companyName={view?.company_display_name ?? ""}
        jobTitle={view?.job_title ?? ""}
        phaseLabel={phaseLabel}
      >
        <PreInterviewSteps ui={ui} />
        <div
          className={
            inInterview || ui.kind === "closing" || ui.kind === "escalated" ? "studio-grid" : ""
          }
        >
          <div key={ui.kind} className="animate-fade-up flex flex-col gap-6">
            <Body
              ui={ui}
              token={token}
              language={language}
              media={media}
              applied={applied}
              behavioralCapture={behavioralCapture}
              onRetry={() => dispatch({ type: "RETRY" })}
            />
          </div>
          {(inInterview || ui.kind === "closing" || ui.kind === "escalated") && (
            <StudioMedia
              media={media}
              active={inInterview}
              paused={ui.kind === "paused"}
              finished={ui.kind === "closing" || ui.kind === "escalated"}
              consent={!!view?.consent.recording_consent}
              title={view?.job_title ?? "Interview"}
              question={view?.current_turn?.candidate_message ?? ""}
              elapsedSeconds={view?.elapsed_seconds ?? 0}
              durationMinutes={view?.duration_minutes ?? 0}
            />
          )}
        </div>
      </SessionChrome>
    </I18nProvider>
  );
}

function Body({
  ui,
  token,
  language,
  media,
  applied,
  behavioralCapture,
  onRetry,
}: {
  ui: UiState;
  token: string;
  language: string;
  media: ReturnType<typeof useMediaCapture>;
  applied: string[];
  behavioralCapture: boolean;
  onRetry: () => void;
}) {
  switch (ui.kind) {
    case "loading":
      return (
        <div className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      );
    case "error":
      return <ErrorScreen message={ui.message} retryable={ui.retryable} onRetry={onRetry} />;
    case "consent":
      return <ConsentStep token={token} view={ui.view} />;
    case "device_check":
      return <DeviceCheck token={token} view={ui.view} />;
    case "disclosure":
      return <DisclosureStep token={token} view={ui.view} />;
    case "escalated":
      return (
        <EscalatedScreen
          language={language}
          message={ui.view.current_turn?.candidate_message ?? null}
          token={ui.view.interview_purpose === "mock_practice" ? token : undefined}
        />
      );
    case "closing":
      return (
        <ClosingScreen
          turn={ui.turn}
          language={language}
          token={ui.view.interview_purpose === "mock_practice" ? token : undefined}
        />
      );
    case "paused":
      return (
        <>
          <PausedScreen token={token} turn={ui.turn} language={language} />
          <RightsBar token={token} disabled={false} applied={ui.view.accommodations_applied} />
        </>
      );
    case "asking":
    case "candidate_questions":
    case "submitting":
    case "requesting": {
      const waiting = ui.kind === "submitting" || ui.kind === "requesting";
      const turn = ui.turn;
      const voiceAvailable =
        ui.view.consent.recording_consent &&
        ui.view.interview_modality !== "text" &&
        !applied.includes("text_modality") &&
        media.microphone !== "denied";
      return (
        <>
          <QuestionCard
            turn={turn}
            language={language}
            waiting={waiting}
            readAloud={applied.includes("read_aloud")}
          />
          {!waiting && turn && turn.requires_answer ? (
            <AnswerComposer
              token={token}
              turn={turn}
              media={media}
              timerDisabled={applied.includes("extended_answer_time")}
              voiceAvailable={voiceAvailable}
              captionsEnabled={applied.includes("captions")}
              behavioralCapture={behavioralCapture}
            />
          ) : null}
          <RightsBar token={token} disabled={waiting} applied={ui.view.accommodations_applied} />
        </>
      );
    }
    default: {
      const exhaustive: never = ui;
      return exhaustive;
    }
  }
}

const PRE_STEPS = ["Consent", "Setup", "Begin"];

function PreInterviewSteps({ ui }: { ui: UiState }) {
  const index =
    ui.kind === "consent" ? 0 : ui.kind === "device_check" ? 1 : ui.kind === "disclosure" ? 2 : -1;
  if (index < 0) return null;
  return <StepIndicator steps={PRE_STEPS} current={index} />;
}
