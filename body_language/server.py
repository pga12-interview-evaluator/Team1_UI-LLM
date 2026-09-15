"""Body-language signal service for the interview BFF (wraps Team 3's analysis, unchanged).

Team 3's script (``Team3_Body_language/task31_body_language_percentage_json.py``) reads a local
webcam and shows OpenCV windows. In the app the camera lives in the candidate's browser, so this
service receives JPEG frames per answer, runs Team 3's ``FeatureExtractor`` + rule/ML classifiers
+ 5-second averaging on them, and returns Team 3's report shape plus the reduced metrics the BFF
turns into a ``behavioral_signals/1.0`` envelope (prompts_v2/00 §12). Team 3's code is imported
as-is; nothing in their folder is modified.

Run (own venv — MediaPipe needs numpy 2, the Whisper service needs numpy 1):
    python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
    .venv/Scripts/python server.py                # http://127.0.0.1:8009

Endpoints:
    GET    /health                                        → {"ok", "analysis_mode", "sessions"}
    POST   /sessions/{sid}/frames                         multipart: turn_index, frames[] (name = "<t_ms>.jpg")
    POST   /sessions/{sid}/turns/{turn_index}/finalize    → Team 3 report + intervals + derived metrics
    DELETE /sessions/{sid}                                → release landmarkers and buffers

Observable coaching signals only (Team 3's own note): never confidence, honesty, personality or
employability. The BFF enforces the non-scored contract; this service just measures.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

HERE = Path(__file__).resolve().parent
TEAM3_DIR = HERE.parent / "Team3_Body_language"
sys.path.insert(0, str(TEAM3_DIR))
import task31_body_language_percentage_json as t3  # noqa: E402  (Team 3 module, unmodified)

PORT = int(os.environ.get("BODY_LANGUAGE_PORT", "8009"))
REPORT_DIR = Path(os.environ.get("BODY_LANGUAGE_REPORTS", HERE / "reports"))
IDLE_TTL_SEC = 30 * 60
CALIBRATION_MIN_FRAMES = 10  # same bar as t3.calibrate_camera
CALIBRATION_MIN_MS = 3000  # t3 calibrates for 3 s
FACE_ABSENT_EVENT_MS = 3000
MAX_FRAMES_PER_REQUEST = 16
SERVICE_VERSION = "1.0.0"

app = FastAPI(title="body_language", version=SERVICE_VERSION)


# ------------------------------------------------------------------ per-turn accumulation


@dataclass
class TurnCapture:
    turn_index: int
    samples: list[dict] = field(default_factory=list)  # Team 3 sample dicts (features + labels)
    first_ms: int | None = None
    last_ms: int | None = None
    total_frames: int = 0
    detected_frames: int = 0
    # Event tracking, mirrors run_live_analysis but on the client clock.
    gaze_away_start: int | None = None
    gaze_away_active: bool = False
    gaze_away_events: list[dict] = field(default_factory=list)
    high_move_start: int | None = None
    high_move_active: bool = False
    high_movement_periods: int = 0
    undetected_start: int | None = None
    face_absent_events: list[dict] = field(default_factory=list)
    posture_shift_count: int = 0
    last_posture: str | None = None
    processing_ms: float = 0.0


@dataclass
class SessionAnalysis:
    session_id: str
    extractor: t3.FeatureExtractor
    models: dict
    lock: threading.Lock = field(default_factory=threading.Lock)
    gaze_history: deque = field(default_factory=lambda: deque(maxlen=t3.SMOOTHING_WINDOW))
    posture_history: deque = field(default_factory=lambda: deque(maxlen=t3.SMOOTHING_WINDOW))
    movement_history: deque = field(default_factory=lambda: deque(maxlen=t3.SMOOTHING_WINDOW))
    calibration_widths: list[float] = field(default_factory=list)
    calibration_first_ms: int | None = None
    calibrated: bool = False
    turns: dict[int, TurnCapture] = field(default_factory=dict)
    last_seen: float = field(default_factory=time.time)

    @property
    def use_ml(self) -> bool:
        return len(self.models) == 3


_sessions: dict[str, SessionAnalysis] = {}
_sessions_lock = threading.Lock()


def _get_session(session_id: str, create: bool) -> SessionAnalysis | None:
    with _sessions_lock:
        found = _sessions.get(session_id)
        if found is None and create:
            found = SessionAnalysis(session_id=session_id, extractor=t3.FeatureExtractor(), models=t3.load_models())
            _sessions[session_id] = found
        if found:
            found.last_seen = time.time()
        return found


def _drop_session(session_id: str) -> bool:
    with _sessions_lock:
        found = _sessions.pop(session_id, None)
    if not found:
        return False
    with found.lock:
        found.extractor.close()
    return True


def _reap_idle() -> None:
    while True:
        time.sleep(60)
        cutoff = time.time() - IDLE_TTL_SEC
        with _sessions_lock:
            stale = [sid for sid, s in _sessions.items() if s.last_seen < cutoff]
        for sid in stale:
            _drop_session(sid)


threading.Thread(target=_reap_idle, daemon=True).start()


# ------------------------------------------------------------------ frame processing


def _decode(data: bytes) -> np.ndarray | None:
    array = np.frombuffer(data, dtype=np.uint8)
    frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
    return frame if frame is not None and frame.ndim == 3 else None


def _classify(session: SessionAnalysis, features: dict) -> tuple[str, str, str]:
    if session.use_ml:
        return (
            t3.predict_with_model(session.models["gaze"], features),
            t3.predict_with_model(session.models["posture"], features),
            t3.predict_with_model(session.models["movement"], features),
        )
    return (
        t3.classify_gaze_rule(features),
        t3.classify_posture_rule(features),
        t3.classify_movement_rule(features["movement_score"]),
    )


def _calibrate(session: SessionAnalysis, features: dict | None, t_ms: int) -> None:
    """Same procedure as t3.calibrate_camera, fed by browser frames instead of cv2.VideoCapture."""
    if session.calibration_first_ms is None:
        session.calibration_first_ms = t_ms
    if features and features["shoulder_width"] > 0:
        session.calibration_widths.append(features["shoulder_width"])
    enough_frames = len(session.calibration_widths) >= CALIBRATION_MIN_FRAMES
    enough_time = t_ms - session.calibration_first_ms >= CALIBRATION_MIN_MS
    if enough_frames and enough_time:
        baseline = float(np.median(session.calibration_widths))
        session.extractor.set_baseline(shoulder_width=baseline, face_width=baseline)
        session.extractor.reset_motion()
        session.calibrated = True


def _track_events(turn: TurnCapture, features: dict | None, gaze: str | None, movement: str | None, t_ms: int) -> None:
    event_ms = int(t3.EVENT_DURATION_SECONDS * 1000)
    if features is None:
        if turn.undetected_start is None:
            turn.undetected_start = t_ms
        return
    if turn.undetected_start is not None:
        gap = t_ms - turn.undetected_start
        if gap >= FACE_ABSENT_EVENT_MS:
            turn.face_absent_events.append({"at_ms": turn.undetected_start, "duration_ms": gap})
        turn.undetected_start = None
    # Gaze-away event (>= 1.5 s not facing the camera), with duration until gaze returns.
    if gaze != "CAMERA":
        if turn.gaze_away_start is None:
            turn.gaze_away_start = t_ms
        if not turn.gaze_away_active and t_ms - turn.gaze_away_start >= event_ms:
            turn.gaze_away_active = True
            turn.gaze_away_events.append({"at_ms": turn.gaze_away_start, "duration_ms": t_ms - turn.gaze_away_start})
        elif turn.gaze_away_active:
            turn.gaze_away_events[-1]["duration_ms"] = t_ms - turn.gaze_away_start
    else:
        turn.gaze_away_start = None
        turn.gaze_away_active = False
    # High-movement period (>= 1.5 s of HIGH).
    if movement == "HIGH":
        if turn.high_move_start is None:
            turn.high_move_start = t_ms
        if not turn.high_move_active and t_ms - turn.high_move_start >= event_ms:
            turn.high_move_active = True
            turn.high_movement_periods += 1
    else:
        turn.high_move_start = None
        turn.high_move_active = False


def _process_frame(session: SessionAnalysis, turn: TurnCapture, frame: np.ndarray, t_ms: int) -> bool:
    frame = cv2.flip(frame, 1)  # Team 3 mirrors the webcam; keep their geometry
    features, _ = session.extractor.process(frame)
    turn.total_frames += 1
    turn.first_ms = t_ms if turn.first_ms is None else turn.first_ms
    turn.last_ms = t_ms
    if not session.calibrated:
        # Warm-up frames only set the distance baseline (Team 3: 3 s, >= 10 detected frames).
        _calibrate(session, features, t_ms)
        if features is None:
            _track_events(turn, None, None, None, t_ms)
        return features is not None
    if features is None:
        _track_events(turn, None, None, None, t_ms)
        return False
    turn.detected_frames += 1
    gaze, posture, movement = _classify(session, features)
    session.gaze_history.append(gaze)
    session.posture_history.append(posture)
    session.movement_history.append(movement)
    stable_gaze = t3.majority_label(session.gaze_history)
    stable_posture = t3.majority_label(session.posture_history)
    stable_movement = t3.majority_label(session.movement_history)
    turn.samples.append({**features, "t_ms": t_ms, "gaze": stable_gaze, "posture": stable_posture, "movement": stable_movement})
    if turn.last_posture is not None and stable_posture != turn.last_posture:
        turn.posture_shift_count += 1
    turn.last_posture = stable_posture
    _track_events(turn, features, stable_gaze, stable_movement, t_ms)
    return True


# ------------------------------------------------------------------ finalize (Team 3 report + derived metrics)


def _intervals(turn: TurnCapture) -> list[dict]:
    """Bucket samples into Team 3's 5-second windows on the client clock; reuse their averaging."""
    if not turn.samples or turn.first_ms is None:
        return []
    width_ms = int(t3.JSON_AVERAGE_INTERVAL_SECONDS * 1000)
    buckets: dict[int, list[dict]] = {}
    for sample in turn.samples:
        buckets.setdefault((sample["t_ms"] - turn.first_ms) // width_ms, []).append(sample)
    intervals = []
    for index in sorted(buckets):
        start = index * width_ms / 1000
        end = min((index + 1) * width_ms, (turn.last_ms or 0) - turn.first_ms) / 1000
        record = t3.create_average_interval(buckets[index], start, end)
        if record:
            record["percentages"] = t3.calculate_percentage_scores(record)
            intervals.append(record)
    return intervals


def _finalize(session: SessionAnalysis, turn: TurnCapture) -> dict:
    intervals = _intervals(turn)
    duration_ms = (turn.last_ms - turn.first_ms) if turn.first_ms is not None and turn.last_ms is not None else 0
    analyzed = len(turn.samples)
    presence = turn.detected_frames / turn.total_frames if turn.total_frames else 0.0
    gaze_ratio = sum(s["gaze"] == "CAMERA" for s in turn.samples) / analyzed if analyzed else 0.0
    centered_ratio = sum(abs(s["head_yaw"]) <= t3.HEAD_YAW_GOOD for s in turn.samples) / analyzed if analyzed else 0.0
    upright_ratio = sum(s["posture"] == "UPRIGHT" for s in turn.samples) / analyzed if analyzed else 0.0
    if turn.undetected_start is not None and turn.last_ms is not None:
        gap = turn.last_ms - turn.undetected_start
        if gap >= FACE_ABSENT_EVENT_MS:
            turn.face_absent_events.append({"at_ms": turn.undetected_start, "duration_ms": gap})
    report = {  # Team 3's session report shape (run_live_analysis), per answer
        "generated_at": datetime.now().isoformat(),
        "five_second_interval_count": len(intervals),
        "analysis_mode": "ML" if session.use_ml else "rule_based",
        "session_duration_seconds": round(duration_ms / 1000, 2),
        "camera_presence_percent": round(presence * 100, 2),
        "camera_facing_gaze_percent": round(gaze_ratio * 100, 2),
        "centered_head_percent": round(centered_ratio * 100, 2),
        "upright_posture_percent": round(upright_ratio * 100, 2),
        "gaze_away_events": len(turn.gaze_away_events),
        "high_movement_periods": turn.high_movement_periods,
        "note": (
            "Observable coaching signals only; not a measure of confidence, honesty, intelligence, "
            "personality, or employability."
        ),
    }
    undetected_ms = int(duration_ms * (1 - presence)) if turn.total_frames else 0
    derived = {  # reduced metrics the BFF maps into behavioral_signals/1.0 (gaze + body only)
        "calibrated": session.calibrated,
        "duration_ms": int(duration_ms),
        "frames_total": turn.total_frames,
        "frames_detected": turn.detected_frames,
        "coverage_ratio": round(presence, 4),
        "on_screen_ratio": round(gaze_ratio, 4),
        "off_screen_saccade_count": len(turn.gaze_away_events),
        "sustained_off_screen_ms_max": max((e["duration_ms"] for e in turn.gaze_away_events), default=0),
        "off_screen_events": turn.gaze_away_events,
        "face_visible_ratio": round(presence, 4),
        "posture_shift_count": turn.posture_shift_count,
        "face_out_of_frame_ms": undetected_ms,
        "face_absent_events": turn.face_absent_events,
        "processing_latency_ms": int(turn.processing_ms),
        "analysis_mode": report["analysis_mode"],
        "service_version": SERVICE_VERSION,
    }
    return {
        "turn_index": turn.turn_index,
        "report": report,
        "percentages": t3.create_overall_percentage_summary(intervals),
        "interval_seconds": t3.JSON_AVERAGE_INTERVAL_SECONDS,
        "intervals": intervals,
        "derived": derived,
    }


def _write_report(session_id: str, result: dict) -> None:
    """Keep Team 3-style JSON on disk per answer so their team can inspect raw output."""
    try:
        folder = REPORT_DIR / session_id
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"turn_{result['turn_index']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    except OSError as exc:  # never fail the interview because a report could not be written
        print(f"report write skipped: {exc}")


# ------------------------------------------------------------------ HTTP


@app.get("/health")
def health() -> dict:
    with _sessions_lock:
        count = len(_sessions)
    return {
        "ok": True,
        "service_version": SERVICE_VERSION,
        "analysis_mode": "ML" if len(t3.load_models()) == 3 else "rule_based",
        "sessions": count,
    }


@app.post("/sessions/{session_id}/frames")
async def push_frames(
    session_id: str,
    turn_index: int = Form(...),
    frames: list[UploadFile] = File(...),
) -> dict:
    if not frames:
        raise HTTPException(status_code=400, detail="no frames")
    if len(frames) > MAX_FRAMES_PER_REQUEST:
        raise HTTPException(status_code=413, detail=f"max {MAX_FRAMES_PER_REQUEST} frames per request")
    payload: list[tuple[int, bytes]] = []
    for upload in frames:
        stem = Path(upload.filename or "").stem
        if not stem.isdigit():
            raise HTTPException(status_code=400, detail="frame filename must be <t_ms>.jpg")
        payload.append((int(stem), await upload.read()))
    payload.sort(key=lambda item: item[0])
    session = _get_session(session_id, create=True)
    assert session is not None
    started = time.perf_counter()
    detected = 0
    with session.lock:
        turn = session.turns.setdefault(turn_index, TurnCapture(turn_index=turn_index))
        for t_ms, data in payload:
            frame = _decode(data)
            if frame is None:
                continue
            if _process_frame(session, turn, frame, t_ms):
                detected += 1
        turn.processing_ms += (time.perf_counter() - started) * 1000
    return {
        "received": len(payload),
        "detected": detected,
        "calibrated": session.calibrated,
        "samples": len(turn.samples),
    }


@app.post("/sessions/{session_id}/turns/{turn_index}/finalize")
def finalize_turn(session_id: str, turn_index: int) -> dict:
    session = _get_session(session_id, create=False)
    if session is None:
        raise HTTPException(status_code=404, detail="unknown session")
    with session.lock:
        turn = session.turns.pop(turn_index, None)
        if turn is None:
            raise HTTPException(status_code=404, detail="no frames for this turn")
        result = _finalize(session, turn)
    _write_report(session_id, result)
    return result


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str) -> dict:
    return {"released": _drop_session(session_id)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
