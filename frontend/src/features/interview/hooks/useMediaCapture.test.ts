import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateApi } from "@/lib/api/candidate";
import { useMediaCapture } from "./useMediaCapture";

vi.mock("@/lib/api/candidate", () => ({ candidateApi: { uploadMediaChunk: vi.fn() } }));
class TestStream {
  getAudioTracks() {
    return [{ stop: vi.fn(), readyState: "live" }];
  }
  getVideoTracks() {
    return [];
  }
  getTracks() {
    return this.getAudioTracks();
  }
}
class TestRecorder {
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  static isTypeSupported() {
    return true;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["final audio bytes"]) });
    this.onstop?.();
  }
}
beforeEach(() => {
  vi.stubGlobal("MediaStream", TestStream);
  vi.stubGlobal("MediaRecorder", TestRecorder);
  vi.stubGlobal("AudioContext", undefined);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(new TestStream()) },
  });
  vi.mocked(candidateApi.uploadMediaChunk).mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("answer upload completion", () => {
  it("waits for the final chunk and returns this turn's media reference", async () => {
    let acknowledge!: (value: { media_ref: string; received_bytes: number }) => void;
    vi.mocked(candidateApi.uploadMediaChunk).mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useMediaCapture({
        token: "test",
        wantCamera: false,
        wantMicrophone: true,
        uploadEnabled: true,
      }),
    );
    await act(async () => {
      await result.current.acquire();
    });
    act(() => {
      result.current.startRecording(7);
    });
    let stopped!: Promise<string | null>;
    await act(async () => {
      stopped = result.current.stopRecording();
    });
    let finished = false;
    void stopped.then(() => {
      finished = true;
    });
    expect(finished).toBe(false);
    expect(candidateApi.uploadMediaChunk).toHaveBeenCalledWith("test", 7, expect.any(Blob), 0);
    await act(async () => {
      acknowledge({ media_ref: "answer-7", received_bytes: 17 });
      await stopped;
    });
    expect(await stopped).toBe("answer-7");
    expect(result.current.recording).toBe(false);
    act(() => {
      result.current.startRecording(8);
    });
    expect(result.current.lastMediaRef).toBeNull();
  });
  it("rejects a failed final upload instead of returning a stale reference", async () => {
    vi.mocked(candidateApi.uploadMediaChunk).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() =>
      useMediaCapture({
        token: "test",
        wantCamera: false,
        wantMicrophone: true,
        uploadEnabled: true,
      }),
    );
    await act(async () => {
      await result.current.acquire();
    });
    act(() => {
      result.current.startRecording(1);
    });
    await act(async () => {
      await expect(result.current.stopRecording()).rejects.toThrow("audio upload failed");
    });
    expect(result.current.lastMediaRef).toBeNull();
  });
});
