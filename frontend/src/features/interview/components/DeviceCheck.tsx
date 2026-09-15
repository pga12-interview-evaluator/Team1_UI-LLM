"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { candidateApi } from "@/lib/api/candidate";
import type { CandidateSessionView } from "@/lib/api/schemas/candidate";
import { useT } from "@/lib/i18n/I18nProvider";
import { useMediaCapture } from "../hooks/useMediaCapture";
import { useInterviewStore } from "../store/useInterviewStore";

export function DeviceCheck({ token, view }: { token: string; view: CandidateSessionView }) {
  const t = useT();
  const dispatch = useInterviewStore((s) => s.dispatch);
  const setModality = useInterviewStore((s) => s.setModality);
  const wantCamera =
    view.consent.recording_consent && !view.accommodations_applied.includes("camera_off");
  const wantMic = view.consent.recording_consent && view.interview_modality !== "text";
  const media = useMediaCapture({
    token,
    wantCamera,
    wantMicrophone: wantMic,
    uploadEnabled: false,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void media.acquire();
    // acquire is stable per (wantCamera, wantMic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantCamera, wantMic]);

  useEffect(() => {
    if (videoRef.current && media.stream) videoRef.current.srcObject = media.stream;
  }, [media.stream]);

  const proceed = async (textOnly: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (textOnly) setModality("text");
      const next = await candidateApi.markDeviceReady(token, {
        camera: media.camera === "granted" && !textOnly,
        microphone: media.microphone === "granted" && !textOnly,
      });
      media.release();
      dispatch({ type: "REQUEST_OK", view: next });
    } catch {
      setError("Couldn’t save your device check. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const micOk = media.microphone === "granted";
  // Only the microphone gates "Continue": a missing or blocked camera just means camera off.
  const problem =
    media.microphone === "denied"
      ? t.device.denied
      : media.microphone === "unavailable" && wantMic
        ? t.device.notFound
        : null;
  const cameraProblem =
    wantCamera && (media.camera === "denied" || media.camera === "unavailable")
      ? t.device.cameraSkipped
      : null;

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader title={t.device.title} />
      <CardBody className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border-line bg-surface-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.device.micLabel}</span>
              <Badge tone={micOk ? "ok" : media.microphone === "unknown" ? "neutral" : "warn"}>
                {micOk ? t.device.micOk : media.microphone}
              </Badge>
            </div>
            <p className="text-ink-muted mt-2 text-sm">{t.device.testMic}</p>
            <div
              className="bg-line mt-3 h-2 w-full overflow-hidden rounded-full"
              role="meter"
              aria-label={t.device.levelLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(media.level * 100)}
            >
              <div
                className="bg-ok h-full transition-[width]"
                style={{ width: `${Math.round(media.level * 100)}%` }}
              />
            </div>
          </div>
          <div className="border-line bg-surface-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.device.camLabel}</span>
              <Badge
                tone={
                  media.camera === "granted"
                    ? "ok"
                    : media.camera === "unknown"
                      ? "neutral"
                      : "warn"
                }
              >
                {media.camera === "granted" ? t.device.camOk : wantCamera ? media.camera : "off"}
              </Badge>
            </div>
            {wantCamera ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="mt-3 aspect-video w-full rounded-md bg-black object-cover"
                aria-label={t.device.camLabel}
              />
            ) : (
              <p className="text-ink-muted mt-3 text-sm">{t.device.cameraOff}</p>
            )}
          </div>
        </div>
        {problem ? <Alert tone="warn">{problem}</Alert> : null}
        {!problem && cameraProblem ? <Alert tone="info">{cameraProblem}</Alert> : null}
        {error ? <Alert tone="bad">{error}</Alert> : null}
        {problem ? (
          <Button variant="secondary" onClick={media.acquire}>
            Retry camera and microphone
          </Button>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => proceed(true)} loading={busy}>
            {t.device.textOnly}
          </Button>
          <Button
            size="lg"
            onClick={() => proceed(false)}
            loading={busy}
            disabled={wantMic && !micOk}
          >
            {t.device.proceed}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
