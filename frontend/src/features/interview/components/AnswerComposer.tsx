"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, CardBody, TimerRing } from "@/components/ui";
import { candidateApi } from "@/lib/api/candidate";
import { ApiError, newIdempotencyKey } from "@/lib/api/client";
import type { CandidateTurnDto } from "@/lib/api/schemas/candidate";
import { useT } from "@/lib/i18n/I18nProvider";
import { track } from "@/lib/telemetry/track";
import { useAnswerTimer } from "../hooks/useAnswerTimer";
import type { useMediaCapture } from "../hooks/useMediaCapture";
import { useInterviewStore } from "../store/useInterviewStore";

type Media = ReturnType<typeof useMediaCapture>;

interface Props {
  token: string;
  turn: CandidateTurnDto;
  media: Media;
  timerDisabled: boolean;
  voiceAvailable: boolean;
  captionsEnabled: boolean;
}

export function AnswerComposer({
  token,
  turn,
  media,
  timerDisabled,
  voiceAvailable,
  captionsEnabled,
}: Props) {
  const t = useT();
  const {
    modality,
    setModality,
    draft,
    setDraft,
    answerKey,
    beginAnswer,
    clearAnswer,
    dispatch,
    answerStartedAt,
  } = useInterviewStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveModality = voiceAvailable ? modality : "text";

  const submit = useCallback(
    async (auto: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      setError(null);
      const key = answerKey ?? newIdempotencyKey();
      beginAnswer(key);
      dispatch({ type: "SUBMIT_START" });
      try {
        const mediaRef = effectiveModality === "voice" ? await media.stopRecording() : null;
        const elapsed = answerStartedAt ? Date.now() - answerStartedAt : 0;
        const next = await candidateApi.submitAnswer(
          token,
          {
            turn_index: turn.turn_index,
            text: draft.trim(),
            media_ref: mediaRef,
            client_elapsed_ms: elapsed,
            auto_submitted: auto,
          },
          key,
        );
        track({
          name: "candidate.answer_submitted",
          auto,
          elapsed_ms: elapsed,
          modality: effectiveModality,
        });
        clearAnswer();
        setCaption("");
        dispatch({ type: "SUBMIT_OK", view: next });
      } catch (caught) {
        const apiError = caught instanceof ApiError ? caught : null;
        const message = caught instanceof Error ? caught.message : t.common.errorBody;
        setError(message);
        dispatch({
          type: "SUBMIT_FAIL",
          message,
          retryable: apiError ? apiError.isRetryable : true,
        });
      } finally {
        submittingRef.current = false;
        setBusy(false);
      }
    },
    [
      answerKey,
      answerStartedAt,
      beginAnswer,
      clearAnswer,
      dispatch,
      draft,
      effectiveModality,
      media,
      t.common.errorBody,
      token,
      turn.turn_index,
    ],
  );

  const timer = useAnswerTimer({
    maxAnswerSeconds: timerDisabled ? null : turn.max_answer_seconds,
    startedAt: answerStartedAt,
    resetKey: turn.turn_index,
    running: turn.requires_answer && !busy,
    onExpire: () => void submit(true),
  });

  // Voice: start recording as soon as a question that requires an answer is on screen.
  useEffect(() => {
    if (effectiveModality !== "voice" || !turn.requires_answer || !media.stream) return;
    media.startRecording(turn.turn_index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.turn_index, effectiveModality, media.stream]);

  // Optional live captions of the candidate's own speech (never the record of the answer).
  useEffect(() => {
    if (!captionsEnabled || effectiveModality !== "voice") return;
    type RecognitionCtor = new () => SpeechRecognition;
    const speechWindow = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = 0; i < event.results.length; i += 1)
        text += event.results[i]?.[0]?.transcript ?? "";
      setCaption(text);
    };
    try {
      recognition.start();
    } catch {
      /* already started */
    }
    return () => recognition.stop();
  }, [captionsEnabled, effectiveModality, turn.turn_index]);

  useEffect(() => {
    if (effectiveModality === "text") textareaRef.current?.focus();
  }, [effectiveModality, turn.turn_index]);

  const canSubmit =
    effectiveModality === "voice"
      ? media.recording || draft.trim().length > 0
      : draft.trim().length > 0;

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink text-sm font-medium">
            {turn.phase_label === "your_questions"
              ? t.interview.questionsPhaseHint
              : t.interview.yourAnswer}
          </p>
          {!timerDisabled && timer.remaining !== null ? (
            <TimerRing
              remaining={timer.remaining}
              total={turn.max_answer_seconds}
              warning={timer.warning}
              label={t.interview.timeLeft}
            />
          ) : null}
        </div>
        {timer.warning ? (
          <Alert tone="warn" live>
            {t.interview.autoSubmitSoon}
          </Alert>
        ) : null}

        {effectiveModality === "voice" ? (
          <div className="border-line bg-surface-2 flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`size-3 rounded-full ${media.recording ? "bg-bad animate-ring" : "bg-line-strong"}`}
              />
              <span className="text-sm font-medium" role="status">
                {media.recording ? t.interview.recording : t.interview.startRecording}
              </span>
              <div className="bg-line ml-auto h-1.5 w-32 overflow-hidden rounded-full" aria-hidden>
                <div
                  className="bg-ok h-full transition-[width]"
                  style={{ width: `${Math.round(media.level * 100)}%` }}
                />
              </div>
            </div>
            {captionsEnabled ? (
              <div>
                <p className="text-ink-muted text-xs">{t.interview.liveCaptions}</p>
                <p className="text-ink mt-1 min-h-6 text-sm" aria-live="off">
                  {caption}
                </p>
                <p className="text-ink-muted mt-1 text-xs">{t.interview.captionsHint}</p>
              </div>
            ) : null}
            {!media.recording ? (
              <Button variant="secondary" onClick={() => media.startRecording(turn.turn_index)}>
                {t.interview.startRecording}
              </Button>
            ) : null}
          </div>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">{t.interview.yourAnswer}</span>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.interview.typePlaceholder}
              rows={6}
              maxLength={20_000}
              disabled={busy}
              className="border-line-strong bg-surface text-ink placeholder:text-ink-muted focus:border-brand w-full resize-y rounded-xl border px-4 py-3 text-[16px] leading-relaxed transition-[border-color,box-shadow] focus:shadow-[0_0_0_4px_var(--brand-soft)] focus:outline-none"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSubmit) void submit(false);
              }}
            />
          </label>
        )}

        {error ? <Alert tone="bad">{error}</Alert> : null}
        {media.error ? <Alert tone="warn">{media.error}</Alert> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {voiceAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (effectiveModality === "voice") {
                  void media
                    .stopRecording()
                    .catch(() =>
                      setError("Audio upload failed. You can type your answer instead."),
                    );
                  setModality("text");
                } else {
                  setModality("voice");
                }
              }}
              disabled={busy}
            >
              {effectiveModality === "voice" ? t.interview.switchToText : t.interview.switchToVoice}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {effectiveModality === "text" ? (
              <span className="text-ink-muted hidden text-xs sm:inline">
                <kbd className="border-line bg-surface-2 rounded border px-1.5 py-0.5 font-mono text-[11px]">
                  Ctrl
                </kbd>{" "}
                +{" "}
                <kbd className="border-line bg-surface-2 rounded border px-1.5 py-0.5 font-mono text-[11px]">
                  Enter
                </kbd>{" "}
                to submit
              </span>
            ) : null}
            <Button
              size="lg"
              onClick={() => void submit(false)}
              disabled={!canSubmit}
              loading={busy}
            >
              {effectiveModality === "voice" ? t.interview.stopRecording : t.interview.submit}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
