"""Voice to text: record mic until silence, transcribe with Whisper.

Single-file setup. No ffmpeg needed (audio passed to Whisper as numpy array).

Usage:
    python voice_to_text.py                  # record until silence, transcribe
    python voice_to_text.py --lang hi        # force Hindi (no auto-detect, no translate)
    python voice_to_text.py --model small    # better Hinglish than base
    python voice_to_text.py --file x.wav     # transcribe existing WAV (any rate, auto-resampled)
    python voice_to_text.py --json           # print structured JSON (text, segments, timings)
    python voice_to_text.py --live           # streaming: text prints while you talk

Install:
    pip install openai-whisper pyaudio numpy scipy torch
"""

import argparse
import json
import os
import queue
import sys
import threading
import time
import wave

import numpy as np
import whisper

try:  # Mic capture is CLI-only; the HTTP service runs where no audio device (or portaudio) exists.
    import pyaudio
except ImportError:  # pragma: no cover
    pyaudio = None

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

SAMPLE_RATE = 16000            # Whisper native rate
CHANNELS = 1
CHUNK = 1024                   # ~64 ms per chunk at 16 kHz
SAMPLE_WIDTH = 2               # int16

CALIBRATION_SEC = 0.7          # sample ambient noise before recording
THRESHOLD_MULTIPLIER = 2.5     # voice = rms > noise_floor * this
MIN_THRESHOLD = 300            # never go below this (int16 rms)
SILENCE_LIMIT_SEC = 4.0        # stop after this much trailing silence (Team 2 setting)
START_TIMEOUT_SEC = 10.0       # abort if no voice within this window
MAX_RECORD_SEC = 120.0         # hard cap

OUTPUT_FILE = "audio.wav"
MODEL_NAME = "base"            # tiny | base | small | medium | large
LANGUAGE = None                # "hi", "en", or None = auto-detect
# Vocabulary hint: names, college, tech terms. Whisper biases toward these spellings.
# In the interview system, build this from the resume + JD.
VOCAB_HINT = ""                # e.g. "Chaitanya Rana, Vishwakarma College of Engineering, SQL, inner join"
FP16 = False                   # must be False on CPU

# Team 2 decoding settings (voice_to_text/team2/voice_to_textproject.ipynb).
# Base prompt tells Whisper to expect Hinglish + data/tech vocabulary; the per-session
# VOCAB_HINT (candidate name, JD terms) is appended to it.
BASE_PROMPT = (
    "This is a Hindi and English mixed voice transcription. "
    "The speaker may talk about Python, machine learning, data analytics, Excel, SQL, "
    "Power BI, Tableau, statistics, data science and technology."
)
BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))   # 5 = Team 2 default; 1 = fastest on CPU
NO_SPEECH_THRESHOLD = 0.6      # drop segments Whisper thinks are silence

_MODEL_CACHE: dict = {}

# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------


def rms(chunk: bytes) -> float:
    samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32)
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(samples ** 2)))


def pcm_to_float32(pcm: bytes) -> np.ndarray:
    """int16 PCM -> float32 in [-1, 1]. Whisper accepts this directly."""
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def save_wav(pcm: bytes, path: str = OUTPUT_FILE) -> str:
    with wave.open(path, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm)
    return path


def load_wav_as_float32(path: str) -> np.ndarray:
    """Read any WAV -> float32 mono 16 kHz."""
    from scipy.io import wavfile

    rate, data = wavfile.read(path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if data.dtype == np.int16:
        data = data.astype(np.float32) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float32) / 2147483648.0
    else:
        data = data.astype(np.float32)
    if rate != SAMPLE_RATE:
        from scipy.signal import resample_poly

        data = resample_poly(data, SAMPLE_RATE, rate).astype(np.float32)
    return data


# ---------------------------------------------------------------------------
# Recording
# ---------------------------------------------------------------------------


def _calibrate_threshold(stream) -> float:
    """Measure ambient noise for CALIBRATION_SEC, return voice threshold."""
    n_chunks = max(1, int(SAMPLE_RATE / CHUNK * CALIBRATION_SEC))
    levels = [rms(stream.read(CHUNK, exception_on_overflow=False)) for _ in range(n_chunks)]
    noise_floor = float(np.median(levels))
    return max(MIN_THRESHOLD, noise_floor * THRESHOLD_MULTIPLIER)


def record_until_silence(
    silence_limit: float = SILENCE_LIMIT_SEC,
    start_timeout: float = START_TIMEOUT_SEC,
    max_seconds: float = MAX_RECORD_SEC,
) -> bytes:
    """Record from default mic. Stops after `silence_limit` s of silence post-speech.

    Returns raw int16 PCM bytes; empty bytes if no voice detected in time.
    """
    if pyaudio is None:
        raise RuntimeError("pyaudio is not installed; microphone capture is unavailable here")
    audio = pyaudio.PyAudio()
    stream = audio.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=CHUNK,
    )

    frames: list[bytes] = []
    try:
        print("Calibrating mic (stay quiet)...", end=" ", flush=True)
        threshold = _calibrate_threshold(stream)
        print(f"threshold={threshold:.0f}")
        print(f"Recording. Speak now. Stops after {silence_limit:.0f}s silence.")

        voice_started = False
        silence_start = None
        start_time = time.time()

        while True:
            data = stream.read(CHUNK, exception_on_overflow=False)
            frames.append(data)
            now = time.time()

            if now - start_time > max_seconds:
                print("\nStopped (max length).")
                break

            if rms(data) > threshold:
                voice_started = True
                silence_start = None
                print(".", end="", flush=True)
                continue

            if voice_started:
                silence_start = silence_start or now
                silent_for = now - silence_start
                print(f"\rsilence {silent_for:.1f}s ", end="", flush=True)
                if silent_for >= silence_limit:
                    print("\nStopped (silence).")
                    break
            elif now - start_time > start_timeout:
                print("\nNo voice detected.")
                return b""
    finally:
        stream.stop_stream()
        stream.close()
        audio.terminate()

    return b"".join(frames)


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------


def build_prompt(vocab_hint: str = "") -> str:
    """Team 2 base prompt + optional per-session vocabulary hint."""
    hint = (vocab_hint or "").strip()
    return f"{BASE_PROMPT} {hint}".strip() if hint else BASE_PROMPT


def load_model(name: str = MODEL_NAME):
    if name not in _MODEL_CACHE:
        print(f"Loading Whisper '{name}'...", flush=True)
        _MODEL_CACHE[name] = whisper.load_model(name)
    return _MODEL_CACHE[name]


def transcribe(
    audio: np.ndarray,
    language: str | None = LANGUAGE,
    model_name: str = MODEL_NAME,
    vocab_hint: str = VOCAB_HINT,
) -> dict:
    """audio: float32 mono 16 kHz in [-1, 1].

    Returns:
        {
          "text": str,
          "language": str,
          "duration_sec": float,
          "transcribe_sec": float,
          "segments": [{"start": float, "end": float, "text": str}, ...],
        }
    """
    model = load_model(model_name)
    t0 = time.time()
    result = model.transcribe(
        audio,
        language=language,
        task="transcribe",                 # never "translate": keep source language
        fp16=FP16,
        temperature=0.0,                   # deterministic, less hallucination
        beam_size=BEAM_SIZE,               # Team 2: beam search, better Hinglish decoding
        no_speech_threshold=NO_SPEECH_THRESHOLD,
        # Team 2's notebook uses condition_on_previous_text=True; kept False here because
        # it causes repeat-loop hallucinations on long interview answers.
        condition_on_previous_text=False,
        initial_prompt=build_prompt(vocab_hint),  # Hinglish/tech base + names / domain terms
    )
    return {
        "text": result["text"].strip(),
        "language": result.get("language"),
        "duration_sec": round(len(audio) / SAMPLE_RATE, 2),
        "transcribe_sec": round(time.time() - t0, 2),
        "segments": [
            {"start": round(s["start"], 2), "end": round(s["end"], 2), "text": s["text"].strip()}
            for s in result.get("segments", [])
        ],
    }


def record_and_transcribe(
    language: str | None = LANGUAGE,
    model_name: str = MODEL_NAME,
    save_path: str | None = OUTPUT_FILE,
    vocab_hint: str = VOCAB_HINT,
) -> dict | None:
    """One-shot: record until silence, then transcribe. Importable entrypoint."""
    load_model(model_name)  # warm up first so model download never stalls the mic
    pcm = record_until_silence()
    if not pcm:
        return None
    if save_path:
        print(f"Saved {save_wav(pcm, save_path)}")
    return transcribe(pcm_to_float32(pcm), language=language, model_name=model_name, vocab_hint=vocab_hint)


# ---------------------------------------------------------------------------
# Real-time (streaming)
# ---------------------------------------------------------------------------

PAUSE_SEC = 0.8            # gap that ends one spoken segment
MAX_SEGMENT_SEC = 15.0     # force-cut long monologues so text keeps flowing
MIN_SEGMENT_SEC = 0.4      # ignore clicks / breaths
NO_SPEECH_PROB = 0.6       # drop Whisper segments it thinks are silence


def _transcribe_segment(model, audio, language, prev_text):
    result = model.transcribe(
        audio,
        language=language,
        task="transcribe",
        fp16=FP16,
        temperature=0.0,
        beam_size=BEAM_SIZE,
        no_speech_threshold=NO_SPEECH_THRESHOLD,
        condition_on_previous_text=False,
        initial_prompt=build_prompt(prev_text[-200:]),  # vocabulary continuity between segments
    )
    kept = [s for s in result.get("segments", []) if s.get("no_speech_prob", 0) < NO_SPEECH_PROB]
    return " ".join(s["text"].strip() for s in kept).strip(), result.get("language")


def realtime_transcribe(
    language=LANGUAGE,
    model_name=MODEL_NAME,
    pause_sec=PAUSE_SEC,
    end_silence_sec=SILENCE_LIMIT_SEC,
    start_timeout=START_TIMEOUT_SEC,
    max_seconds=MAX_RECORD_SEC,
    save_path=OUTPUT_FILE,
    vocab_hint=VOCAB_HINT,
):
    """Stream mic -> Whisper. Prints each segment as soon as it is transcribed.

    Returns dict: text, language, segments[{start, end, text}], duration_sec.
    """
    model = load_model(model_name)
    work = queue.Queue()
    done = threading.Event()
    pieces = []           # [{start, end, text}]
    detected = {"lang": None}

    def worker():
        prev = vocab_hint
        while True:
            item = work.get()
            if item is None:
                done.set()
                return
            seg_audio, t_start, t_end = item
            text, lang = _transcribe_segment(model, seg_audio, language, prev)
            if not text:
                continue
            detected["lang"] = detected["lang"] or lang
            pieces.append({"start": round(t_start, 2), "end": round(t_end, 2), "text": text})
            prev = (prev + " " + text)[-500:]
            print(f"[{t_start:5.1f}s] {text}", flush=True)

    threading.Thread(target=worker, daemon=True).start()

    if pyaudio is None:
        raise RuntimeError("pyaudio is not installed; microphone capture is unavailable here")
    audio = pyaudio.PyAudio()
    stream = audio.open(
        format=pyaudio.paInt16, channels=CHANNELS, rate=SAMPLE_RATE, input=True, frames_per_buffer=CHUNK
    )
    all_frames = []
    seg_frames = []
    chunk_sec = CHUNK / SAMPLE_RATE

    try:
        print("Calibrating mic (stay quiet)...", end=" ", flush=True)
        threshold = _calibrate_threshold(stream)
        print(f"threshold={threshold:.0f}")
        print(f"Live. Speak. Stops after {end_silence_sec:.0f}s silence.\n")

        elapsed = 0.0
        seg_start = 0.0
        voice_started = False
        in_voice = False
        silent_for = 0.0

        def flush_segment(end_t):
            nonlocal seg_frames, seg_start
            dur = end_t - seg_start
            if dur >= MIN_SEGMENT_SEC and seg_frames:
                work.put((pcm_to_float32(b"".join(seg_frames)), seg_start, end_t))
            seg_frames = []
            seg_start = end_t

        while elapsed < max_seconds:
            data = stream.read(CHUNK, exception_on_overflow=False)
            all_frames.append(data)
            elapsed += chunk_sec
            loud = rms(data) > threshold

            if loud:
                if not in_voice:
                    seg_start = elapsed - chunk_sec
                    seg_frames = []
                in_voice = True
                voice_started = True
                silent_for = 0.0
                seg_frames.append(data)
                if elapsed - seg_start >= MAX_SEGMENT_SEC:
                    flush_segment(elapsed)
                continue

            silent_for += chunk_sec
            if in_voice:
                seg_frames.append(data)  # keep short tail so words are not clipped
                if silent_for >= pause_sec:
                    in_voice = False
                    flush_segment(elapsed)
            if voice_started and silent_for >= end_silence_sec:
                print("\nStopped (silence).")
                break
            if not voice_started and elapsed >= start_timeout:
                print("\nNo voice detected.")
                break
        else:
            print("\nStopped (max length).")

        if in_voice:
            flush_segment(elapsed)
    finally:
        stream.stop_stream()
        stream.close()
        audio.terminate()

    work.put(None)
    done.wait()  # worker finishes queued segments, then signals

    pcm = b"".join(all_frames)
    if save_path and pcm:
        save_wav(pcm, save_path)

    pieces.sort(key=lambda p: p["start"])
    return {
        "text": " ".join(p["text"] for p in pieces),
        "language": detected["lang"],
        "duration_sec": round(len(pcm) / (SAMPLE_RATE * SAMPLE_WIDTH), 2),
        "segments": pieces,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--file", help="Transcribe this WAV instead of recording")
    p.add_argument("--lang", default=LANGUAGE, help="Language code (hi, en). Default auto-detect")
    p.add_argument("--model", default=MODEL_NAME, help="tiny | base | small | medium | large")
    p.add_argument("--no-save", action="store_true", help="Do not write audio.wav")
    p.add_argument("--json", action="store_true", help="Print structured JSON result")
    p.add_argument("--live", action="store_true", help="Streaming mode: print text as you speak")
    p.add_argument("--hint", default=VOCAB_HINT, help="Vocabulary hint: names, college, tech terms")
    return p.parse_args()


def main() -> int:
    args = _parse_args()

    if args.live:
        result = realtime_transcribe(
            language=args.lang,
            model_name=args.model,
            save_path=None if args.no_save else OUTPUT_FILE,
            vocab_hint=args.hint,
        )
    elif args.file:
        audio = load_wav_as_float32(args.file)
        result = transcribe(audio, language=args.lang, model_name=args.model, vocab_hint=args.hint)
    else:
        result = record_and_transcribe(
            language=args.lang,
            model_name=args.model,
            save_path=None if args.no_save else OUTPUT_FILE,
            vocab_hint=args.hint,
        )
        if result is None:
            return 1

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    print("\n=== TRANSCRIPT ===")
    print(result["text"] or "(empty)")
    print(f"=== lang={result['language']}  audio={result['duration_sec']}s  took={result['transcribe_sec']}s ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
