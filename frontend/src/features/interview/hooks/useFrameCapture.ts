"use client";

import { useCallback, useEffect, useRef } from "react";
import { candidateApi } from "@/lib/api/candidate";
import { track } from "@/lib/telemetry/track";

/** ~8 fps: enough for Team 3's per-frame movement score and 15-frame smoothing window. */
const FRAME_INTERVAL_MS = 125;
/** One upload per second; at most this many frames travel per request. */
const BATCH_INTERVAL_MS = 1000;
const MAX_BATCH = 16;
const JPEG_QUALITY = 0.7;
const TARGET_WIDTH = 640;
/** After this many consecutive upload failures the capture stops for the answer (service down). */
const MAX_FAILURES = 3;

interface Options {
  token: string;
  stream: MediaStream | null;
  /** Consent + camera + no accommodation, decided by the shell; false = nothing leaves the browser. */
  enabled: boolean;
  turnIndex: number;
  /** Capture runs only while the candidate is answering (question on screen, not submitting). */
  active: boolean;
}

interface Capture {
  pending: { t_ms: number; blob: Blob }[];
  inFlight: Promise<void> | null;
  stopped: boolean;
  failures: number;
  turnIndex: number;
  stop: () => void;
}

/**
 * Streams downscaled JPEG frames of the candidate's camera to the backend while an answer is
 * being given, so the body-language service (Team 3) can measure it. Frames are batched per
 * second with at most one request in flight; capture stops on submit, camera loss, repeated
 * upload failure, or a 204 from the backend (capture disabled server-side). Nothing is analysed
 * in the browser. Call `flush()` right before submitting the answer so the last second of frames
 * lands before the server closes the window.
 */
export function useFrameCapture({ token, stream, enabled, turnIndex, active }: Options): {
  flush: () => Promise<void>;
} {
  const capture = useRef<Capture | null>(null);

  const send = useCallback(
    async (state: Capture, batch: { t_ms: number; blob: Blob }[]) => {
      if (!batch.length) return;
      try {
        const ack = await candidateApi.pushFrames(token, state.turnIndex, batch);
        state.failures = 0;
        if (ack === "disabled") state.stop();
      } catch (caught) {
        state.failures += 1;
        if (state.failures >= MAX_FAILURES) {
          track({
            name: "candidate.media_error",
            reason: `frames_upload_failed:${String(caught)}`,
          });
          state.stop();
        }
      }
    },
    [token],
  );

  const flush = useCallback(async () => {
    const state = capture.current;
    if (!state) return;
    const batch = state.pending;
    state.pending = [];
    state.stop();
    if (state.inFlight) await state.inFlight;
    if (state.failures < MAX_FAILURES) await send(state, batch);
  }, [send]);

  useEffect(() => {
    const track0 = stream?.getVideoTracks()[0];
    if (!enabled || !active || !track0 || track0.readyState !== "live") return;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track0]);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const startedAt = performance.now();
    const state: Capture = {
      pending: [],
      inFlight: null,
      stopped: false,
      failures: 0,
      turnIndex,
      stop: () => {
        if (state.stopped) return;
        state.stopped = true;
        window.clearInterval(frameTimer);
        window.clearInterval(batchTimer);
        video.pause();
        video.srcObject = null;
      },
    };
    capture.current = state;

    const snap = () => {
      if (state.stopped || video.readyState < 2 || track0.readyState !== "live") return;
      const width = video.videoWidth || TARGET_WIDTH;
      const height = video.videoHeight || Math.round(TARGET_WIDTH * 0.75);
      const scale = Math.min(1, TARGET_WIDTH / width);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const t_ms = Math.round(performance.now() - startedAt);
      canvas.toBlob(
        (blob) => {
          if (!blob || state.stopped) return;
          state.pending.push({ t_ms, blob });
          if (state.pending.length > MAX_BATCH) state.pending = state.pending.slice(-MAX_BATCH);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };

    const tick = () => {
      if (state.stopped || state.inFlight || state.pending.length === 0) return;
      const batch = state.pending;
      state.pending = [];
      state.inFlight = send(state, batch).finally(() => {
        state.inFlight = null;
      });
    };

    const frameTimer = window.setInterval(snap, FRAME_INTERVAL_MS);
    const batchTimer = window.setInterval(tick, BATCH_INTERVAL_MS);
    void video.play().catch(() => state.stop());

    return () => {
      const rest = state.pending;
      state.pending = [];
      state.stop();
      if (rest.length && state.failures < MAX_FAILURES) void send(state, rest);
      if (capture.current === state) capture.current = null;
    };
  }, [token, stream, enabled, turnIndex, active, send]);

  return { flush };
}
