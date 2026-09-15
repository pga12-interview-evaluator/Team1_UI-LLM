"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { candidateApi } from "@/lib/api/candidate";
import { blobToWav16k } from "@/lib/media/wav";
import { track } from "@/lib/telemetry/track";

export type MediaPermission = "unknown" | "granted" | "denied" | "unavailable";

interface CaptureOptions {
  token: string;
  wantCamera: boolean;
  wantMicrophone: boolean;
  /** Upload audio for transcription only with recording consent. Behavioral consent is enforced separately by the service. */
  uploadEnabled: boolean;
}

interface CaptureState {
  microphone: MediaPermission;
  camera: MediaPermission;
  stream: MediaStream | null;
  recording: boolean;
  level: number; // 0..1 input level for the meter
  lastMediaRef: string | null;
  error: string | null;
}

const CHUNK_MS = 4000;

/**
 * Mic/camera capture for the interview. Audio chunks are uploaded per answer so the backend can
 * transcribe (ASR) and the ML services can compute signals. Nothing is analysed in the browser.
 */
export function useMediaCapture({
  token,
  wantCamera,
  wantMicrophone,
  uploadEnabled,
}: CaptureOptions) {
  const [state, setState] = useState<CaptureState>({
    microphone: "unknown",
    camera: "unknown",
    stream: null,
    recording: false,
    level: 0,
    lastMediaRef: null,
    error: null,
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const turnRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const acquireVersion = useRef(0);
  const uploadError = useRef<Error | null>(null);
  const uploadedRef = useRef<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopPromise = useRef<Promise<string | null> | null>(null);

  const acquire = useCallback(async () => {
    const version = ++acquireVersion.current;
    if (!wantCamera && !wantMicrophone) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState((s) => ({ ...s, microphone: "unavailable", camera: "unavailable" }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: wantMicrophone ? { echoCancellation: true, noiseSuppression: true } : false,
        video: wantCamera
          ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
          : false,
      });
      if (version !== acquireVersion.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setState((s) => ({
        ...s,
        stream,
        microphone: wantMicrophone
          ? stream.getAudioTracks().length
            ? "granted"
            : "unavailable"
          : s.microphone,
        camera: wantCamera
          ? stream.getVideoTracks().length
            ? "granted"
            : "unavailable"
          : s.camera,
        error: null,
      }));
    } catch (error) {
      if (version !== acquireVersion.current) return;
      const name = (error as DOMException).name;
      const denied = name === "NotAllowedError" || name === "SecurityError";
      setState((s) => ({
        ...s,
        microphone: wantMicrophone ? (denied ? "denied" : "unavailable") : s.microphone,
        camera: wantCamera ? (denied ? "denied" : "unavailable") : s.camera,
        error: name,
      }));
      track({ name: "candidate.media_error", reason: name });
    }
  }, [wantCamera, wantMicrophone]);

  // Input level meter (visual only; never uploaded, never used for anything else).
  useEffect(() => {
    const stream = state.stream;
    if (!stream || !stream.getAudioTracks().length || typeof AudioContext === "undefined") return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      const rms = Math.sqrt(sum / data.length) / 128;
      setState((s) => (Math.abs(s.level - rms) > 0.02 ? { ...s, level: Math.min(1, rms * 3) } : s));
      analyserRef.current = { ctx, raf: requestAnimationFrame(loop) };
    };
    analyserRef.current = { ctx, raf: requestAnimationFrame(loop) };
    return () => {
      if (analyserRef.current) cancelAnimationFrame(analyserRef.current.raf);
      void ctx.close();
      analyserRef.current = null;
    };
  }, [state.stream]);

  const startRecording = useCallback(
    (turnIndex: number) => {
      const stream = state.stream;
      if (!stream || !stream.getAudioTracks().length || typeof MediaRecorder === "undefined")
        return false;
      if (recorderRef.current?.state === "recording") return true;
      if (stopPromise.current) return false;
      const audioOnly = new MediaStream(stream.getAudioTracks());
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(audioOnly, mime ? { mimeType: mime } : undefined);
      } catch {
        setState((s) => ({
          ...s,
          error: "Audio recording is unavailable. You can type your answer instead.",
        }));
        return false;
      }
      turnRef.current = turnIndex;
      uploadError.current = null;
      uploadedRef.current = null;
      setState((s) => ({ ...s, lastMediaRef: null }));
      // Buffer locally; one WAV upload happens on stop (Whisper needs the whole utterance anyway).
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(CHUNK_MS);
      recorderRef.current = recorder;
      setState((s) => ({ ...s, recording: true }));
      return true;
    },
    [state.stream, token, uploadEnabled],
  );

  const stopRecording = useCallback((): Promise<string | null> => {
    if (stopPromise.current) return stopPromise.current;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording")
      return uploadError.current
        ? Promise.reject(uploadError.current)
        : Promise.resolve(uploadedRef.current);
    stopPromise.current = new Promise((resolve, reject) => {
      recorder.onstop = async () => {
        setState((s) => ({ ...s, recording: false }));
        try {
          const turnIndex = turnRef.current;
          if (uploadEnabled && turnIndex !== null && chunksRef.current.length) {
            const raw = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
            // Prefer 16 kHz WAV (what Whisper wants); fall back to the raw container if decoding is unavailable.
            const payload = await blobToWav16k(raw).catch(() => raw);
            const ack = await candidateApi.uploadMediaChunk(token, turnIndex, payload, 0);
            uploadedRef.current = ack.media_ref;
            setState((s) => ({ ...s, lastMediaRef: ack.media_ref }));
          }
          resolve(uploadedRef.current);
        } catch (caught) {
          const failure = new Error(
            "Your audio upload failed. Switch to text or record your answer again.",
          );
          uploadError.current = failure;
          track({ name: "candidate.media_error", reason: `wav_upload_failed:${String(caught)}` });
          reject(failure);
        } finally {
          chunksRef.current = [];
          stopPromise.current = null;
        }
      };
      recorder.stop();
    });
    return stopPromise.current;
  }, [token, uploadEnabled]);

  const release = useCallback(() => {
    ++acquireVersion.current;
    void stopRecording().catch(() => {});
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState((s) => ({ ...s, stream: null, recording: false, level: 0 }));
  }, [stopRecording]);

  const stopVideo = useCallback(() => {
    state.stream?.getVideoTracks().forEach((t) => {
      t.stop();
      state.stream?.removeTrack(t);
    });
    setState((s) => ({ ...s, camera: "unavailable" }));
  }, [state.stream]);

  useEffect(
    () => () => {
      ++acquireVersion.current;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { ...state, acquire, startRecording, stopRecording, release, stopVideo };
}
