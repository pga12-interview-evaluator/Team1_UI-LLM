"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveRecording, type SavedRecording } from "@/features/recordings/storage";

export function useSessionRecording({
  stream,
  title,
  question,
}: {
  stream: MediaStream | null;
  title: string;
  question: string;
}) {
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "recording" | "paused" | "saving" | "saved">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRecording | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const resources = useRef<(() => void) | null>(null);
  const source = useRef({ stream, question });
  const mounted = useRef(true);
  const sharing = useRef(false);
  const shareVersion = useRef(0);
  const stopPromise = useRef<Promise<void> | null>(null);
  const finish = useRef<(() => void) | null>(null);
  useEffect(() => {
    source.current = { stream, question };
  }, [stream, question]);
  const stopSharing = useCallback(() => {
    shareVersion.current += 1;
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    if (mounted.current) setScreen(null);
  }, []);
  const shareScreen = useCallback(async () => {
    if (sharing.current || screenRef.current) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(
        "Screen sharing is unavailable here. Try a desktop browser over HTTPS or localhost.",
      );
      return;
    }
    sharing.current = true;
    const version = shareVersion.current;
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10 },
        audio: false,
      });
      if (!mounted.current || version !== shareVersion.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      screenRef.current = next;
      setScreen(next);
      setError(null);
      next.getVideoTracks()[0].addEventListener("ended", stopSharing, { once: true });
    } catch (caught) {
      if (mounted.current)
        setError(
          (caught as Error).name === "NotAllowedError"
            ? "Screen sharing was cancelled or blocked. You can try again whenever you’re ready."
            : "Couldn’t share your screen. Try another window or browser.",
        );
    } finally {
      sharing.current = false;
    }
  }, [stopSharing]);
  const start = useCallback(() => {
    if (recorder.current || stopPromise.current) return;
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      setError(
        "Session recording isn’t supported in this browser. Try Chrome or Edge on a desktop.",
      );
      return;
    }
    const input = source.current.stream;
    if (!input?.getTracks().some((t) => t.readyState === "live") && !screenRef.current) {
      setError("Enable your microphone, camera, or screen sharing before recording.");
      return;
    }
    let output: MediaStream | null = null;
    let drawTimer: ReturnType<typeof setInterval> | null = null;
    const cam = document.createElement("video");
    const display = document.createElement("video");
    for (const video of [cam, display]) {
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
    }
    const cleanup = () => {
      if (drawTimer) clearInterval(drawTimer);
      output?.getTracks().forEach((t) => t.stop());
      cam.srcObject = null;
      display.srcObject = null;
    };
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      const draw = () => {
        const current = source.current;
        if (cam.srcObject !== current.stream) {
          cam.srcObject = current.stream;
          if (current.stream) void cam.play().catch(() => {});
        }
        if (display.srcObject !== screenRef.current) {
          display.srcObject = screenRef.current;
          if (screenRef.current) void display.play().catch(() => {});
        }
        ctx.fillStyle = "#241c39";
        ctx.fillRect(0, 0, 1280, 720);
        if (screenRef.current && display.readyState >= 2) {
          const ratio = Math.min(1280 / display.videoWidth, 660 / display.videoHeight);
          const w = display.videoWidth * ratio,
            h = display.videoHeight * ratio;
          ctx.drawImage(display, (1280 - w) / 2, 50 + (660 - h) / 2, w, h);
        } else {
          ctx.fillStyle = "#d7c5f0";
          ctx.font = "28px sans-serif";
          ctx.fillText("Your interview conversation", 54, 125);
          ctx.fillStyle = "#ffffff";
          ctx.font = "24px sans-serif";
          const words = current.question.split(/\s+/);
          let line = "",
            y = 190;
          for (const word of words) {
            if (ctx.measureText(line + word).width > 800) {
              ctx.fillText(line, 54, y);
              line = "";
              y += 38;
              if (y > 490) break;
            }
            line += word + " ";
          }
          ctx.fillText(line, 54, y);
        }
        if (
          current.stream?.getVideoTracks().some((t) => t.readyState === "live" && t.enabled) &&
          cam.readyState >= 2
        )
          ctx.drawImage(cam, 990, 500, 256, 192);
        ctx.fillStyle = "#241c39";
        ctx.fillRect(0, 0, 1280, 50);
        ctx.fillStyle = "#d7c5f0";
        ctx.font = "18px sans-serif";
        ctx.fillText(`Interviewly  |  ${title.slice(0, 80)}`, 24, 32);
      };
      draw();
      output = canvas.captureStream(10);
      // Clone mic tracks so stopping this recording never stops the answer microphone.
      input
        ?.getAudioTracks()
        .filter((t) => t.readyState === "live")
        .forEach((t) => output!.addTrack(t.clone()));
      const mime = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(output, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 700000,
        audioBitsPerSecond: 64000,
      });
      const chunks: Blob[] = [];
      const started = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        if (mounted.current)
          setError(
            "Recording was interrupted. Any captured media will be saved when the recorder stops.",
          );
        if (rec.state !== "inactive") rec.stop();
      };
      rec.onstop = async () => {
        cleanup();
        resources.current = null;
        if (mounted.current) setStatus("saving");
        const item: SavedRecording = {
          id: crypto.randomUUID(),
          title,
          createdAt: new Date(started).toISOString(),
          durationSeconds: (Date.now() - started) / 1000,
          blob: new Blob(chunks, { type: rec.mimeType }),
        };
        if (item.blob.size) {
          if (mounted.current) setSaved(item);
          try {
            await saveRecording(item);
          } catch {
            if (mounted.current)
              setError(
                "Browser storage is full or unavailable. Download this recording below before leaving.",
              );
          }
        } else if (mounted.current)
          setError("No media was captured. Check your devices and try recording again.");
        if (mounted.current) setStatus(item.blob.size ? "saved" : "idle");
        recorder.current = null;
        finish.current?.();
        stopPromise.current = null;
      };
      resources.current = cleanup;
      recorder.current = rec;
      drawTimer = setInterval(draw, 100);
      rec.start(4000);
      setError(null);
      setSaved(null);
      setStatus("recording");
    } catch {
      cleanup();
      recorder.current = null;
      setError("Couldn’t start recording. Check your devices and try again.");
    }
  }, [title]);
  const stop = useCallback((): Promise<void> => {
    if (stopPromise.current) return stopPromise.current;
    const rec = recorder.current;
    if (!rec || rec.state === "inactive") return Promise.resolve();
    stopPromise.current = new Promise((resolve) => {
      finish.current = resolve;
    });
    rec.stop();
    return stopPromise.current;
  }, []);
  const pause = useCallback(() => {
    if (recorder.current?.state === "recording") {
      recorder.current.pause();
      setStatus("paused");
    }
  }, []);
  const resume = useCallback(() => {
    if (recorder.current?.state === "paused") {
      recorder.current.resume();
      setStatus("recording");
    }
  }, []);
  useEffect(() => {
    if (status !== "recording" && status !== "paused" && status !== "saving") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSharing();
      if (recorder.current?.state !== "inactive") void stop();
      else resources.current?.();
    };
  }, [stop, stopSharing]);
  return { screen, status, error, saved, shareScreen, stopSharing, start, stop, pause, resume };
}
