# Team 2 — voice to text (source)

Original notebook from `pga12-interview-evaluator/Team_2_Voice_to_text` (commit `07496c4`).
Record mic until 4 s of silence → save `audio.wav` → Whisper `small` transcription.

What the app takes from it (merged into `../voice_to_text.py`, served by `../server.py`):

| Team 2 setting | Where it lives now |
|---|---|
| `initial_prompt` — Hinglish + data/tech vocabulary | `BASE_PROMPT` + per-session hint via `build_prompt()` |
| `beam_size=5` | `BEAM_SIZE` (env `WHISPER_BEAM_SIZE`, default 5) |
| `no_speech_threshold=0.6` | `NO_SPEECH_THRESHOLD` |
| `SILENCE_LIMIT = 4` | `SILENCE_LIMIT_SEC = 4.0` (CLI recording only; browser handles mic in the app) |
| `whisper.load_model("small")` | env `WHISPER_MODEL=small` (default `base` for CPU speed) |
| `condition_on_previous_text=True` | **not adopted** — causes repeat-loop hallucinations on long answers; kept `False` |

The notebook itself is not executed by the app; PyAudio mic capture is replaced by the browser
sending 16 kHz WAV to `POST /transcribe`.
