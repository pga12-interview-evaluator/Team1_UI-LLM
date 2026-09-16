"""Whisper transcription HTTP service for the interview BFF.

Wraps voice_to_text.transcribe() — Team 2 decoding settings (see team2/README.md), no ffmpeg. The browser sends
16 kHz mono 16-bit WAV (frontend/src/lib/media/wav.ts), any WAV is auto-resampled anyway.

Run:
    pip install -r requirements.txt
    python server.py                       # http://127.0.0.1:8008
    WHISPER_MODEL=small python server.py   # better Hinglish; slower on CPU

Endpoints:
    GET  /health                → {"ok": true, "model": "base"}
    POST /transcribe            multipart: file=<wav>, language=<hi|en|''>, hint=<vocab>
                                → {"text", "language", "duration_sec", "transcribe_sec", "segments",
                                   "speech": Team 4 fillers / repetitions / pauses / wpm / fluency_score}
"""

from __future__ import annotations

import hmac
import io
import os
import sys
import time

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from scipy.io import wavfile
from scipy.signal import resample_poly

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import team4_speech  # noqa: E402  (Team 4 fillers / pauses / fluency, loaded verbatim from their notebook)
import voice_to_text as v2t  # noqa: E402

MODEL_NAME = os.environ.get("WHISPER_MODEL", v2t.MODEL_NAME)
PORT = int(os.environ.get("WHISPER_PORT", "8008"))

app = FastAPI(title="voice_to_text", version="1.0")

# Optional shared secret: when SERVICE_TOKEN is set (cloud), every request except /health must carry
# "Authorization: Bearer <token>". Unset locally, so nothing changes on a laptop.
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN", "").strip()


@app.middleware("http")
async def require_service_token(request, call_next):
    if SERVICE_TOKEN and request.url.path != "/health":
        header = request.headers.get("authorization", "")
        if not (header.startswith("Bearer ") and hmac.compare_digest(header[7:].strip(), SERVICE_TOKEN)):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("WHISPER_CORS", "http://localhost:3000").split(","),
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


def wav_bytes_to_float32(data: bytes) -> np.ndarray:
    rate, samples = wavfile.read(io.BytesIO(data))
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    if samples.dtype == np.int16:
        audio = samples.astype(np.float32) / 32768.0
    elif samples.dtype == np.int32:
        audio = samples.astype(np.float32) / 2147483648.0
    elif samples.dtype == np.uint8:
        audio = (samples.astype(np.float32) - 128.0) / 128.0
    else:
        audio = samples.astype(np.float32)
    if rate != v2t.SAMPLE_RATE:
        audio = resample_poly(audio, v2t.SAMPLE_RATE, rate).astype(np.float32)
    return audio


@app.on_event("startup")
def warm_up() -> None:
    v2t.load_model(MODEL_NAME)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_NAME, "beam_size": v2t.BEAM_SIZE}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(""),
    hint: str = Form(""),
) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio")
    try:
        audio = wav_bytes_to_float32(data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"could not decode WAV: {exc}") from exc
    if audio.size < v2t.SAMPLE_RATE * 0.3:
        return {"text": "", "language": language or None, "duration_sec": round(audio.size / v2t.SAMPLE_RATE, 2), "transcribe_sec": 0.0, "segments": []}
    lang = language.strip() or None
    # Accept BCP-47 tags from the app ("hi-IN" → "hi").
    if lang and "-" in lang:
        lang = lang.split("-")[0]
    t0 = time.time()
    result = v2t.transcribe(audio, language=lang, model_name=MODEL_NAME, vocab_hint=hint.strip())
    result["transcribe_sec"] = round(time.time() - t0, 2)
    try:
        result["speech"] = team4_speech.analyze(result["text"], result["segments"], result["duration_sec"])
    except Exception as exc:  # noqa: BLE001 — coaching extras never fail a transcription
        print(f"team4 speech analysis skipped: {exc}")
        result["speech"] = None
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=PORT, log_level="info")
