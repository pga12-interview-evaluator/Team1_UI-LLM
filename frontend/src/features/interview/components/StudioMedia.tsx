"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { recordingFilename } from "@/features/recordings/storage";
import type { useMediaCapture } from "../hooks/useMediaCapture";
import { useSessionRecording } from "../hooks/useSessionRecording";
export function StudioMedia({
  media,
  active,
  paused,
  finished,
  consent,
  title,
  question,
}: {
  media: ReturnType<typeof useMediaCapture>;
  active: boolean;
  paused: boolean;
  finished: boolean;
  consent: boolean;
  title: string;
  question: string;
}) {
  const recording = useSessionRecording({ stream: media.stream, title, question });
  const { start, pause, resume, stop, stopSharing, status } = recording;
  const camera = useRef<HTMLVideoElement>(null);
  const display = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  const pausedForBreak = useRef(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  useEffect(() => {
    if (camera.current) camera.current.srcObject = media.stream;
  }, [media.stream]);
  useEffect(() => {
    if (display.current) display.current.srcObject = recording.screen;
  }, [recording.screen]);
  useEffect(() => {
    if (active && !paused && consent && media.stream && !started.current) {
      started.current = true;
      start();
    }
  }, [active, paused, consent, media.stream, start]);
  useEffect(() => {
    if (paused && status === "recording") {
      pausedForBreak.current = true;
      pause();
    } else if (!paused && pausedForBreak.current && status === "paused") {
      pausedForBreak.current = false;
      resume();
    }
  }, [paused, status, pause, resume]);
  useEffect(() => {
    if (finished) {
      stopSharing();
      void stop();
    }
  }, [finished, stop, stopSharing]);
  useEffect(() => {
    if (!recording.saved) return;
    const url = URL.createObjectURL(recording.saved.blob);
    // Pair the browser resource's creation and revocation with the saved recording.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recording.saved]);
  const hasCamera = media.stream?.getVideoTracks().some((t) => t.readyState === "live");
  return (
    <aside className="studio-side">
      <h2>Your studio</h2>
      {hasCamera ? (
        <video
          className="studio-video"
          ref={camera}
          autoPlay
          muted
          playsInline
          aria-label="Your camera preview"
        />
      ) : (
        <div className="studio-placeholder">
          <Icon name="video" size={32} />
          <span>{finished ? "Session finished" : "Camera is off"}</span>
        </div>
      )}
      {recording.screen && (
        <video
          ref={display}
          autoPlay
          muted
          playsInline
          className="studio-video mt-3"
          aria-label="Your shared screen"
        />
      )}
      <div className="studio-devices">
        <div>
          <Icon name="mic" size={15} />
          <span>Microphone</span>
          <span>
            {media.stream?.getAudioTracks().some((t) => t.readyState === "live")
              ? "Connected"
              : "Off"}
          </span>
        </div>
        <div>
          <Icon name="screen" size={15} />
          <span>Screen</span>
          <span>{recording.screen ? "Sharing" : "Not shared"}</span>
        </div>
        <div>
          <Icon name="video" size={15} />
          <span>Recording</span>
          <span role="status">
            {recording.status === "recording" && <span className="recording-dot mr-1" />}
            {recording.status === "idle" ? "Not recording" : recording.status}
          </span>
        </div>
      </div>
      {!finished && (
        <div className="mt-5 flex flex-col gap-2">
          <Button
            variant="secondary"
            disabled={!consent}
            onClick={recording.screen ? recording.stopSharing : recording.shareScreen}
          >
            <Icon name="screen" size={16} />
            {recording.screen ? "Stop sharing" : "Share screen"}
          </Button>
          {consent && (
            <>
              {recording.status === "recording" || recording.status === "paused" ? (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    variant="secondary"
                    disabled={paused}
                    onClick={recording.status === "paused" ? recording.resume : recording.pause}
                  >
                    {recording.status === "paused" ? "Resume recording" : "Pause recording"}
                  </Button>
                  <Button variant="ghost" onClick={() => void recording.stop()}>
                    Save
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  disabled={paused || recording.status === "saving"}
                  onClick={recording.start}
                >
                  <Icon name="video" size={16} />
                  {recording.status === "saved" ? "Record another clip" : "Start recording"}
                </Button>
              )}
            </>
          )}
          {!media.stream && (
            <Button variant="ghost" onClick={media.acquire}>
              Retry devices
            </Button>
          )}
        </div>
      )}
      {!consent && (
        <p className="studio-help">
          Recording and screen capture are off because you didn’t give recording consent.
        </p>
      )}
      {recording.error && (
        <div className="mt-3">
          <Alert tone="warn">{recording.error}</Alert>
        </div>
      )}
      {recording.saved && downloadUrl && (
        <div className="mt-4 flex flex-col gap-3">
          <a
            className="action-link"
            href={downloadUrl}
            download={recordingFilename(recording.saved)}
          >
            <Icon name="download" size={16} />
            Download recording
          </a>
          <Link className="text-brand text-center" href="/recordings">
            Open recording library
          </Link>
        </div>
      )}
      <p className="studio-help">
        {finished
          ? "Wait for saving to finish before leaving this page."
          : "Recordings stay in this browser. Keep this tab open until the recording is saved. Screen and camera appear in one video with microphone audio."}
      </p>
    </aside>
  );
}
