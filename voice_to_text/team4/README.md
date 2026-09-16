# Team 4 — audio data processing (source)

Original notebook from `pga12-interview-evaluator/Team4_Audio_data_processing` (commit `0a96cd5`),
copied unchanged: filler-word detection, repeated-word (fumble) detection, pause detection from
Whisper segments, speaking rate and a 0–100 fluency score.

How the app uses it: `../team4_speech.py` reads this notebook, executes only its function and
constant definitions (the model load and the hard-coded file run are skipped) and calls them on
every `/transcribe` result. Output travels as `speech` on the transcription → per-answer review
("How you spoke") and the `speech_features` / `fluency` producers of the behavioral envelope
(00 §12.1) → `long_pause` and `speech_rate_shift` attention flags, compared only against the
candidate's own warm-up answer. Never a score input.
