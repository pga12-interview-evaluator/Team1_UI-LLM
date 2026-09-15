# body_language — Team 3's analysis as a service

Wraps `../Team3_Body_language/task31_body_language_percentage_json.py` **without modifying it**.
Team 3's script opens a local webcam and OpenCV windows; in the app the camera is in the
candidate's browser, so this service receives JPEG frames per answer and runs Team 3's
`FeatureExtractor`, rule/ML classifiers, 15-frame smoothing, gaze-away / high-movement events and
5-second averaging on them.

## Run

```bash
cd body_language
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # Windows; on macOS/Linux: .venv/bin/pip
.venv/Scripts/python server.py                    # http://127.0.0.1:8009
```

Own venv on purpose: MediaPipe 1.x needs numpy 2, the Whisper service (`voice_to_text/`) runs on
numpy 1.25. Do not install `mediapipe` into the global interpreter.

First start loads the two landmarker models (`Team3_Body_language/task3_models/*.task`, downloaded
by Team 3's `ensure_model` if missing) — ~20 s.

## What the app sends and gets back

| Step | Where | What |
|---|---|---|
| Browser | `frontend/src/features/interview/hooks/useFrameCapture.ts` | 640-px JPEG frames at ~8 fps, batched every second, only while an answer is open and consent + camera + no accommodation hold |
| BFF | `POST /api/v1/candidate/sessions/{token}/frames` → `pushFrames` | forwards to `POST /sessions/{session_id}/frames` (204 when capture is off) |
| Answer submit | `engine/behavioralFlow.ts` → `finalizeTurn` | `POST /sessions/{sid}/turns/{turn}/finalize` → Team 3 report + 5-s intervals + `derived` metrics |
| Envelope | `engine/behavioral.ts` | `derived` → `behavioral_signals/1.0` (gaze + body producers; speech/fluency `missing`) |
| Fusion | `engine/behavioral.ts` `behavioralToAttention` | own warm-up baseline only → `attention_flags` for Prompt 02 (currently `gaze_shift` med/high) |
| Report | `engine/behavioralReport.ts` | `non_scored_behavioral_context` block: counts + flags only |

Calibration: the first ~3 s with ≥ 10 detected frames of a session set the shoulder-width baseline
(same procedure as Team 3's `calibrate_camera`); frames before that are not scored.

Per-answer JSON in Team 3's shape lands in `reports/<session_id>/turn_<n>_<timestamp>.json`
(git-ignored) for Team 3 to inspect. Nothing numeric from here is ever shown to a reviewer or
used in a score — see `prompts_v2/00_shared_contracts.md` §12.

## Endpoints

```
GET    /health
POST   /sessions/{sid}/frames                       multipart: turn_index, frames[] named "<t_ms>.jpg" (≤ 16)
POST   /sessions/{sid}/turns/{turn_index}/finalize
DELETE /sessions/{sid}
```

Env: `BODY_LANGUAGE_PORT` (8009), `BODY_LANGUAGE_REPORTS` (./reports). The BFF reads
`BODY_LANGUAGE_URL` from `frontend/.env.local` (default `http://127.0.0.1:8009`).
